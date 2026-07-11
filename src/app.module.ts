import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TripsModule } from './trips/trips.module';
import { PlacesModule } from './places/places.module';
import { ScheduleModule } from './schedule/schedule.module';
import { RecordsModule } from './records/records.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildDataSourceOptions(configService.getOrThrow<string>('DATABASE_URL')),
    }),
    AuthModule,
    UsersModule,
    TripsModule,
    PlacesModule,
    ScheduleModule,
    RecordsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
