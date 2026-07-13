import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { globalValidationPipeOptions } from './common/pipes/validation-pipe.options';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // plan.md §2(Phase 2)/§16: CORS_ORIGIN 미설정 시 로컬 개발 편의를 위해 전체 허용,
  // 설정 시(쉼표로 여러 origin 구분 가능) 그 origin으로 제한한다.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((origin) => origin.trim()) : true,
  });
  app.useGlobalPipes(new ValidationPipe(globalValidationPipeOptions));
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
