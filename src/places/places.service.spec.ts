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

describe('PlacesService', () => {
  let placeRepository: RepoMock<Place>;
  let tripsService: { getDetail: jest.Mock };
  let tourApiClient: { fetchAreaBasedList: jest.Mock };
  let googlePlacesClient: { matchPlace: jest.Mock };
  let service: PlacesService;

  beforeEach(() => {
    placeRepository = createRepositoryMock<Place>();
    tripsService = { getDetail: jest.fn() };
    tourApiClient = { fetchAreaBasedList: jest.fn() };
    googlePlacesClient = { matchPlace: jest.fn() };

    service = new PlacesService(
      placeRepository as never,
      tripsService as never,
      tourApiClient as never,
      googlePlacesClient as never,
    );
  });

  describe('getCandidates', () => {
    it('trip.areaCode가 없으면 AREA_CODE_REQUIRED를 던지고 TourAPI를 호출하지 않는다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: null, sigunguCode: null });

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

    it('trip의 areaCode/sigunguCode로 TourAPI를 조회하고, 처음 보는 장소는 새로 생성한다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: '1' });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([buildTourApiItem()]);
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);
      googlePlacesClient.matchPlace.mockResolvedValue({ rating: 4.2, reviewCount: 100 });

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledWith(
        expect.objectContaining({ areaCode: '6', sigunguCode: '1' }),
      );
      // create()에 넘긴 객체는 이후 같은 참조를 mutate하므로(§trips.service.spec.ts와 동일
      // 이유) exact equality 대신 호출 여부만 확인한다.
      expect(placeRepository.create).toHaveBeenCalledTimes(1);
      expect(placeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: PlaceSource.TOURAPI }),
      );
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        name: '가덕도 등대',
        rating: 4.2,
        reviewCount: 100,
      });
    });

    it('category가 주어지면 contentTypeId로 변환해 TourAPI에 전달한다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: null });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([]);

      await service.getCandidates('trip-1', 'user-1', { category: 'restaurant' });

      expect(tourApiClient.fetchAreaBasedList).toHaveBeenCalledWith(
        expect.objectContaining({ contentTypeId: '39' }),
      );
    });

    it('이미 캐싱된 장소(source+externalId 일치)는 새로 만들지 않고 갱신한다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: null });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([buildTourApiItem({ title: '새 이름' })]);
      const existing: Place = {
        id: 'place-1',
        source: PlaceSource.TOURAPI,
        externalId: '129156',
        contentTypeId: '12',
        name: '옛 이름',
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
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(existing);
      googlePlacesClient.matchPlace.mockResolvedValue(null);

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(placeRepository.create).not.toHaveBeenCalled();
      expect(result.candidates[0].name).toBe('새 이름');
    });

    it('매칭된 장소를 미매칭 장소보다 항상 앞에 정렬한다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: null });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([
        buildTourApiItem({ contentId: '1', title: '미매칭 장소' }),
        buildTourApiItem({ contentId: '2', title: '매칭 장소' }),
      ]);
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);
      googlePlacesClient.matchPlace.mockImplementation(async ({ name }: { name: string }) =>
        name === '매칭 장소' ? { rating: 3.0, reviewCount: 5 } : null,
      );

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates.map((c) => c.name)).toEqual(['매칭 장소', '미매칭 장소']);
    });

    it('리뷰수가 적어도 평점이 높으면 반드시 1위는 아니다(로그 가중치로 표본 크기를 반영)', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: null });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([
        buildTourApiItem({ contentId: '1', title: '리뷰 1개 5점' }),
        buildTourApiItem({ contentId: '2', title: '리뷰 1만개 4.5점' }),
      ]);
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);
      googlePlacesClient.matchPlace.mockImplementation(async ({ name }: { name: string }) =>
        name === '리뷰 1개 5점'
          ? { rating: 5, reviewCount: 1 }
          : { rating: 4.5, reviewCount: 10000 },
      );

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates[0].name).toBe('리뷰 1만개 4.5점');
    });

    it('Google Places 매칭이 예외를 던져도 후보 조회 전체는 실패하지 않는다', async () => {
      tripsService.getDetail.mockResolvedValue({ areaCode: '6', sigunguCode: null });
      tourApiClient.fetchAreaBasedList.mockResolvedValue([buildTourApiItem()]);
      (placeRepository.findOneBy as jest.Mock).mockResolvedValue(null);
      googlePlacesClient.matchPlace.mockRejectedValue(new Error('502'));

      const result = await service.getCandidates('trip-1', 'user-1', {});

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].rating).toBeNull();
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
  });
});
