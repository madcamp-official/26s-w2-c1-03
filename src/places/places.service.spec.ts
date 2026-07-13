import { TourApiPlaceItem } from './clients/tour-api.client';
import { Place, PlaceSource } from './entities/place.entity';
import { PlacesService } from './places.service';

type RepoMock<T extends object> = {
  [K in keyof import('typeorm').Repository<T>]?: jest.Mock;
};

function createRepositoryMock<T extends object>(): RepoMock<T> {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => entity),
    findOneBy: jest.fn(),
    upsert: jest.fn(async () => ({ identifiers: [], generatedMaps: [], raw: [] })),
    find: jest.fn(async () => []),
  };
}

function buildTourApiItem(overrides: Partial<TourApiPlaceItem> = {}): TourApiPlaceItem {
  return {
    contentId: '129156',
    contentTypeId: '12',
    title: '가덕도 등대',
    addr1: '부산광역시 강서구',
    addr2: null,
    areaCode: '6',
    sigunguCode: '1',
    mapX: '128.8295937487',
    mapY: '35.0006471157',
    cat1: 'A01',
    cat2: 'A0101',
    cat3: 'A01011600',
    tel: null,
    firstImage: null,
    ...overrides,
  };
}

/** TourAPI 아이템에 대응하는 저장된 Place(벌크 upsert 후 repo.find가 돌려주는 형태). */
function buildPlace(item: TourApiPlaceItem, id = item.contentId): Place {
  return {
    id,
    source: PlaceSource.TOURAPI,
    externalId: item.contentId,
    contentTypeId: item.contentTypeId,
    name: item.title,
    address: item.addr1,
    latitude: item.mapY,
    longitude: item.mapX,
    areaCode: item.areaCode,
    sigunguCode: item.sigunguCode,
    categoryCode: item.cat3,
    tel: item.tel,
    imageUrl: item.firstImage,
    overview: null,
    syncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('PlacesService', () => {
  let placeRepository: RepoMock<Place>;
  let tripsService: { getDetail: jest.Mock };
  let tourApiClient: { fetchAreaBasedList: jest.Mock };
  let googlePlacesClient: { matchPlace: jest.Mock; searchText: jest.Mock; getPlaceDetails: jest.Mock };
  let tatsCnctrRateClient: { fetchConcentrationMap: jest.Mock };
  let service: PlacesService;

  beforeEach(() => {
    placeRepository = createRepositoryMock<Place>();
    tripsService = { getDetail: jest.fn() };
    tourApiClient = { fetchAreaBasedList: jest.fn() };
    googlePlacesClient = { matchPlace: jest.fn(), searchText: jest.fn(), getPlaceDetails: jest.fn() };
    tatsCnctrRateClient = { fetchConcentrationMap: jest.fn(async () => new Map<string, number>()) };

    service = new PlacesService(
      placeRepository as never,
      tripsService as never,
      tourApiClient as never,
      googlePlacesClient as never,
      tatsCnctrRateClient as never,
    );
  });

  describe('getCandidates', () => {
    it('trip.areaCode가 없으면 AREA_CODE_REQUIRED를 던지고 TourAPI를 호출하지 않는다', async () => {
      tripsService.getDetail.mockResolvedValue({
        areaCode: null,
        sigunguCode: null,
        startDate: '2026-07-13',
      });

      await expect(service.getCandidates('trip-1', 'user-1', {})).rejects.toMatchObject({
        code: 'AREA_CODE_REQUIRED',
      });
      expect(tourApiClient.fetchAreaBasedList).not.toHaveBeenCalled();
    });

    it('TripsService.getDetail이 던지는 멤버십 에러(TRIP_FORBIDDEN 등)를 그대로 전파한다', async () => {
      const forbidden = Object.assign(new Error('forbidden'), { code: 'TRIP_FORBIDDEN' });
      tripsService.getDetail.mockRejectedValue(forbidden);

      await expect(service.getCandidates('trip-1', 'stranger', {})).rejects.toMatchObject({
        code: 'TRIP_FORBIDDEN',
      });
      expect(tourApiClient.fetchAreaBasedList).not.toHaveBeenCalled();
    });

    it('trip 지역으로 TourAPI를 조회하고 후보를 벌크 upsert한 뒤 집중률을 매칭해 반환한다', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([item]);
      (placeRepository.find as jest.Mock).mockResolvedValue([buildPlace(item)]);
      tatsCnctrRateClient.fetchConcentrationMap.mockResolvedValue(
        new Map([['가덕도등대', 42.5]]),
      );

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledWith(
        expect.objectContaining({ areaCode: '6', sigunguCode: '1' }),
      );
      expect(placeRepository.upsert).toHaveBeenCalledTimes(1);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        name: '가덕도 등대',
        concentrationRate: 42.5,
        rating: null,
      });
    });

    it('category가 주어지면 contentTypeId로 변환해 TourAPI에 전달한다', async () => {
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: null,
        startDate: '2026-07-13',
      });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([]);

      await service.getCandidates('trip-1', 'user-1', { category: 'restaurant' });

      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledWith(
        expect.objectContaining({ contentTypeId: '39' }),
      );
    });

    it('집중률이 높은 관광지를 위로, 매칭 안 된 장소는 TourAPI 순서를 유지한 채 뒤로 정렬한다', async () => {
      const low = buildTourApiItem({ contentId: '1', title: '집중률 낮음' });
      const unmatched = buildTourApiItem({ contentId: '2', title: '미매칭 장소' });
      const high = buildTourApiItem({ contentId: '3', title: '집중률 높음' });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([low, unmatched, high]);
      (placeRepository.find as jest.Mock).mockResolvedValue([
        buildPlace(low),
        buildPlace(unmatched),
        buildPlace(high),
      ]);
      tatsCnctrRateClient.fetchConcentrationMap.mockResolvedValue(
        new Map([
          ['집중률낮음', 10],
          ['집중률높음', 90],
        ]),
      );

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates.map((c) => c.name)).toEqual([
        '집중률 높음',
        '집중률 낮음',
        '미매칭 장소',
      ]);
    });

    it('시군구 코드가 없으면 집중률을 조회하지 않고 TourAPI 순서를 유지한다', async () => {
      const first = buildTourApiItem({ contentId: '1', title: '첫째' });
      const second = buildTourApiItem({ contentId: '2', title: '둘째' });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: null,
        startDate: '2026-07-13',
      });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([first, second]);
      (placeRepository.find as jest.Mock).mockResolvedValue([buildPlace(first), buildPlace(second)]);

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tatsCnctrRateClient.fetchConcentrationMap).not.toHaveBeenCalled();
      expect(result.candidates.map((c) => c.name)).toEqual(['첫째', '둘째']);
      expect(result.candidates[0].concentrationRate).toBeNull();
    });

    it('집중률 조회가 실패해도 후보 조회 전체는 실패하지 않고 TourAPI 순서로 반환한다', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([item]);
      (placeRepository.find as jest.Mock).mockResolvedValue([buildPlace(item)]);
      tatsCnctrRateClient.fetchConcentrationMap.mockRejectedValue(new Error('502'));

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].concentrationRate).toBeNull();
    });
  });

  describe('searchCandidates', () => {
    it('Google 검색 결과를 저장하지 않고(place_id만) 실시간 값으로 후보를 구성한다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: null, sigunguCode: null });
      googlePlacesClient.searchText.mockResolvedValue([
        {
          externalId: 'ChIJ1',
          name: '스타벅스 강남',
          address: '서울 강남구',
          latitude: 37.5,
          longitude: 127.0,
          rating: 4.3,
          reviewCount: 500,
        },
      ]);
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);
      (placeRepository.save as jest.Mock).mockImplementation(async (p) => ({ ...p, id: 'uuid-1' }));

      const result = await service.searchCandidates('trip-1', 'user-1', '스타벅스');

      // 저장된 행에는 Google 콘텐츠(name/address/좌표)가 없어야 한다 — place_id만.
      const saved = (placeRepository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toMatchObject({
        source: PlaceSource.GOOGLE,
        externalId: 'ChIJ1',
        name: null,
        address: null,
        latitude: null,
        longitude: null,
      });
      // 응답은 실시간 Google 값으로 채워진다.
      expect(result.candidates[0]).toMatchObject({
        id: 'uuid-1',
        source: PlaceSource.GOOGLE,
        name: '스타벅스 강남',
        address: '서울 강남구',
        rating: 4.3,
        reviewCount: 500,
      });
    });
  });

  describe('getPlaceDetail', () => {
    it('존재하지 않으면 PLACE_NOT_FOUND를 던진다', async () => {
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);

      await expect(service.getPlaceDetail('missing')).rejects.toMatchObject({
        code: 'PLACE_NOT_FOUND',
      });
    });

    it('존재하면 Google 인기도를 함께 조회해 반환한다', async () => {
      const place: Place = {
        id: 'place-1',
        source: PlaceSource.TOURAPI,
        externalId: '1',
        contentTypeId: '12',
        name: '경복궁',
        address: '서울',
        latitude: '37.5',
        longitude: '126.9',
        areaCode: '1',
        sigunguCode: null,
        categoryCode: 'A01',
        tel: null,
        imageUrl: null,
        overview: null,
        syncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(place);
      googlePlacesClient.matchPlace.mockResolvedValue({ rating: 4.7, reviewCount: 58000 });

      const result = await service.getPlaceDetail('place-1');

      expect(result).toMatchObject({
        id: 'place-1',
        name: '경복궁',
        rating: 4.7,
        reviewCount: 58000,
      });
    });

    it('Google 장소(place_id만 저장)는 place_id로 상세를 실시간 재조회해 반환한다', async () => {
      const googlePlace: Place = {
        id: 'place-g',
        source: PlaceSource.GOOGLE,
        externalId: 'ChIJ1',
        contentTypeId: null,
        name: null,
        address: null,
        latitude: null,
        longitude: null,
        areaCode: null,
        sigunguCode: null,
        categoryCode: null,
        tel: null,
        imageUrl: null,
        overview: null,
        syncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(googlePlace);
      googlePlacesClient.getPlaceDetails.mockResolvedValue({
        externalId: 'ChIJ1',
        name: '스타벅스 강남',
        address: '서울 강남구',
        latitude: 37.5,
        longitude: 127.0,
        rating: 4.3,
        reviewCount: 500,
      });

      const result = await service.getPlaceDetail('place-g');

      expect(googlePlacesClient.getPlaceDetails).toHaveBeenCalledWith('ChIJ1');
      expect(googlePlacesClient.matchPlace).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'place-g',
        source: PlaceSource.GOOGLE,
        name: '스타벅스 강남',
        rating: 4.3,
      });
    });
  });
});
