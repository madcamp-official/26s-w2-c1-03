import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('payload.userId를 AuthenticatedUser({ userId })로 그대로 옮긴다', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('secret'),
    } as unknown as ConfigService;
    const strategy = new JwtStrategy(configService);

    expect(strategy.validate({ userId: 'user-1' })).toEqual({ userId: 'user-1' });
  });
});
