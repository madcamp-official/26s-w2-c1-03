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
    findOne: jest.fn(async () => null),
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

/** TourAPI 아이템에 대응하는 저장된 Place(캐시에서 repo.find가 돌려주는 형태). */
function buildPlace(
  item: TourApiPlaceItem,
  id = item.contentId,
  syncedAt: Date | null = new Date(),
): Place {
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
    syncedAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 캐시 조회(queryByContentType)는 find({ where: { contentTypeId } })로 카테고리별로
 * 읽는다. 이 헬퍼는 contentTypeId → Place[] 맵을 받아 그 동작을 흉내내는 find mock을 만든다.
 */
function findByContentType(placesByContentType: Record<string, Place[]>) {
  return jest.fn(async (options?: { where?: { contentTypeId?: string } }) => {
    const ct = options?.where?.contentTypeId;
    return ct ? placesByContentType[ct] ?? [] : [];
  });
}

/** getAreaCacheState가 "신선한 캐시 있음"으로 판단하도록 최근 syncedAt을 가진 행을 반환. */
function freshCache(placeRepository: RepoMock<Place>) {
  (placeRepository.findOne as jest.Mock).mockResolvedValue({ syncedAt: new Date() });
}

describe('PlacesService', () => {
  let placeRepository: RepoMock<Place>;
  let tripsService: { getDetail: jest.Mock };
  let tourApiClient: { fetchAreaBasedList: jest.Mock };
  let googlePlacesClient: {
    matchPlace: jest.Mock;
    searchText: jest.Mock;
    getPlaceDetails: jest.Mock;
    getPlaceReviews: jest.Mock;
  };
  let tatsCnctrRateClient: { fetchConcentrationMap: jest.Mock };
  let service: PlacesService;

  beforeEach(() => {
    placeRepository = createRepositoryMock<Place>();
    tripsService = { getDetail: jest.fn() };
    tourApiClient = { fetchAreaBasedList: jest.fn() };
    googlePlacesClient = {
      matchPlace: jest.fn(),
      searchText: jest.fn(),
      getPlaceDetails: jest.fn(),
      getPlaceReviews: jest.fn().mockResolvedValue([]),
    };
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

    it('캐시가 비었으면(콜드) TourAPI로 지역을 동기화(관광지/음식점/쇼핑 3종)해 적재한 뒤 DB에서 후보를 읽는다', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      // findOne(신선도 검사)이 null → 콜드 → 동기화. 동기화는 3개 contentType을 받는다.
      (placeRepository.findOne as jest.Mock).mockResolvedValue(null);
      tourApiClient.fetchAreaBasedList.mockResolvedValue([item]);
      // 읽기는 contentType별 find로 이뤄진다 — 관광지(12)에만 후보가 있다고 가정.
      placeRepository.find = findByContentType({ '12': [buildPlace(item)] });
      tatsCnctrRateClient.fetchConcentrationMap.mockResolvedValue(new Map([['가덕도등대', 42.5]]));

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledTimes(3);
      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledWith(
        expect.objectContaining({ areaCode: '6', sigunguCode: '1', contentTypeId: '12' }),
      );
      expect(placeRepository.upsert).toHaveBeenCalledTimes(1);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        name: '가덕도 등대',
        concentrationRate: 42.5,
        rating: null,
      });
    });

    it('캐시가 신선하면 TourAPI를 호출하지 않고 DB에서만 후보를 읽는다(성능 최적화 핵심)', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({ '12': [buildPlace(item)] });

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tourApiClient.fetchAreaBasedList).not.toHaveBeenCalled();
      expect(placeRepository.upsert).not.toHaveBeenCalled();
      expect(result.candidates.map((c) => c.name)).toEqual(['가덕도 등대']);
    });

    it('category 미지정("전체")이면 관광지/음식점/쇼핑을 각각 DB에서 읽어 합친다', async () => {
      const attraction = buildTourApiItem({ contentId: 'a1', contentTypeId: '12', title: '관광지' });
      const restaurant = buildTourApiItem({ contentId: 'r1', contentTypeId: '39', title: '식당' });
      const shopping = buildTourApiItem({ contentId: 's1', contentTypeId: '38', title: '쇼핑몰' });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '38',
        sigunguCode: '13',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({
        '12': [buildPlace(attraction, 'a1')],
        '39': [buildPlace(restaurant, 'r1')],
        '38': [buildPlace(shopping, 's1')],
      });

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(placeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ contentTypeId: '12' }) }),
      );
      expect(placeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ contentTypeId: '39' }) }),
      );
      expect(placeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ contentTypeId: '38' }) }),
      );
      expect(result.candidates.map((c) => c.name)).toEqual(['관광지', '식당', '쇼핑몰']);
    });

    it('category가 주어지면 그 contentTypeId로 DB를 조회한다', async () => {
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: null,
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({ '39': [] });

      await service.getCandidates('trip-1', 'user-1', { category: 'restaurant' });

      expect(placeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ contentTypeId: '39' }) }),
      );
    });

    it('category=restaurant면 음식점(39)을 읽어 카페(cat3=A05020900)는 제외한다', async () => {
      const realRestaurant = buildTourApiItem({
        contentId: 'r1',
        contentTypeId: '39',
        title: '진짜 식당',
        cat3: 'A05020100',
      });
      const cafe = buildTourApiItem({
        contentId: 'c1',
        contentTypeId: '39',
        title: '카페',
        cat3: 'A05020900',
      });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({
        '39': [buildPlace(realRestaurant, 'r1'), buildPlace(cafe, 'c1')],
      });

      const result = await service.getCandidates('trip-1', 'user-1', { category: 'restaurant' });

      expect(result.candidates.map((c) => c.name)).toEqual(['진짜 식당']);
    });

    it('category=cafe면 음식점(39) 중 cat3=A05020900만 남긴다', async () => {
      const realRestaurant = buildTourApiItem({
        contentId: 'r1',
        contentTypeId: '39',
        title: '진짜 식당',
        cat3: 'A05020100',
      });
      const cafe = buildTourApiItem({
        contentId: 'c1',
        contentTypeId: '39',
        title: '카페',
        cat3: 'A05020900',
      });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({
        '39': [buildPlace(realRestaurant, 'r1'), buildPlace(cafe, 'c1')],
      });

      const result = await service.getCandidates('trip-1', 'user-1', { category: 'cafe' });

      expect(result.candidates.map((c) => c.name)).toEqual(['카페']);
    });

    it('집중률이 높은 관광지를 위로, 매칭 안 된 장소는 조회 순서를 유지한 채 뒤로 정렬한다', async () => {
      const low = buildTourApiItem({ contentId: '1', title: '집중률 낮음' });
      const unmatched = buildTourApiItem({ contentId: '2', title: '미매칭 장소' });
      const high = buildTourApiItem({ contentId: '3', title: '집중률 높음' });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({
        '12': [buildPlace(low, '1'), buildPlace(unmatched, '2'), buildPlace(high, '3')],
      });
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

    it('시군구 코드가 없으면 집중률을 조회하지 않고 조회 순서를 유지한다', async () => {
      const first = buildTourApiItem({ contentId: '1', title: '첫째' });
      const second = buildTourApiItem({ contentId: '2', title: '둘째' });
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: null,
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({
        '12': [buildPlace(first, '1'), buildPlace(second, '2')],
      });

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tatsCnctrRateClient.fetchConcentrationMap).not.toHaveBeenCalled();
      expect(result.candidates.map((c) => c.name)).toEqual(['첫째', '둘째']);
      expect(result.candidates[0].concentrationRate).toBeNull();
    });

    it('집중률 조회가 실패해도 후보 조회 전체는 실패하지 않고 조회 순서로 반환한다', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      freshCache(placeRepository);
      placeRepository.find = findByContentType({ '12': [buildPlace(item)] });
      tatsCnctrRateClient.fetchConcentrationMap.mockRejectedValue(new Error('502'));

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].concentrationRate).toBeNull();
    });

    it('콜드 상태에서 TourAPI 동기화가 실패하면 에러를 전파한다(보여줄 캐시가 없음)', async () => {
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      (placeRepository.findOne as jest.Mock).mockResolvedValue(null); // 콜드
      const failure = Object.assign(new Error('down'), { code: 'TOUR_API_REQUEST_FAILED' });
      tourApiClient.fetchAreaBasedList.mockRejectedValue(failure);

      await expect(service.getCandidates('trip-1', 'user-1', {})).rejects.toMatchObject({
        code: 'TOUR_API_REQUEST_FAILED',
      });
    });

    it('stale 캐시에서 동기화가 실패하면 기존 캐시로 폴백한다(에러 안 던짐)', async () => {
      const item = buildTourApiItem();
      tripsService.getDetail.mockResolvedValue({
        areaCode: '6',
        sigunguCode: '1',
        startDate: '2026-07-13',
      });
      // 오래된 캐시 존재(8일 전) → stale이지만 hasAny=true
      (placeRepository.findOne as jest.Mock).mockResolvedValue({
        syncedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      });
      tourApiClient.fetchAreaBasedList.mockRejectedValue(new Error('down'));
      placeRepository.find = findByContentType({ '12': [buildPlace(item)] });

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates.map((c) => c.name)).toEqual(['가덕도 등대']);
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
      googlePlacesClient.matchPlace.mockResolvedValue({
        rating: 4.7,
        reviewCount: 58000,
        externalId: 'ChIJ-gyeongbok',
      });
      googlePlacesClient.getPlaceReviews.mockResolvedValue([
        { authorName: '홍길동', rating: 5, text: '좋아요', relativeTime: '1주 전', profilePhotoUrl: null },
      ]);

      const result = await service.getPlaceDetail('place-1');

      expect(googlePlacesClient.getPlaceReviews).toHaveBeenCalledWith('ChIJ-gyeongbok');
      expect(result).toMatchObject({
        id: 'place-1',
        name: '경복궁',
        rating: 4.7,
        reviewCount: 58000,
        reviews: [{ authorName: '홍길동', rating: 5, text: '좋아요' }],
      });
    });

    it('TourAPI 장소가 Google에 매칭되지 않으면(externalId 없음) 리뷰를 조회하지 않고 빈 배열을 반환한다', async () => {
      const place: Place = {
        id: 'place-2',
        source: PlaceSource.TOURAPI,
        externalId: '2',
        contentTypeId: '12',
        name: '이름 없는 장소',
        address: null,
        latitude: '37.0',
        longitude: '126.0',
        areaCode: '1',
        sigunguCode: null,
        categoryCode: null,
        tel: null,
        imageUrl: null,
        overview: null,
        syncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(place);
      googlePlacesClient.matchPlace.mockResolvedValue(null);

      const result = await service.getPlaceDetail('place-2');

      expect(googlePlacesClient.getPlaceReviews).not.toHaveBeenCalled();
      expect(result.reviews).toEqual([]);
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
      googlePlacesClient.getPlaceReviews.mockResolvedValue([
        { authorName: '김철수', rating: 4, text: '괜찮아요', relativeTime: '2일 전', profilePhotoUrl: null },
      ]);

      const result = await service.getPlaceDetail('place-g');

      expect(googlePlacesClient.getPlaceDetails).toHaveBeenCalledWith('ChIJ1');
      expect(googlePlacesClient.getPlaceReviews).toHaveBeenCalledWith('ChIJ1');
      expect(googlePlacesClient.matchPlace).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'place-g',
        source: PlaceSource.GOOGLE,
        name: '스타벅스 강남',
        rating: 4.3,
        reviews: [{ authorName: '김철수', rating: 4 }],
      });
    });
  });
});
