import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const synchronize = configService.get<boolean>('DB_SYNC') ?? false;
        const migrationsRun =
          configService.get<boolean>('RUN_MIGRATIONS') ?? false;

        return {
          type: 'mysql',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          timezone: 'Z',
          autoLoadEntities: true,
          synchronize,
          migrationsRun,
          migrationsTableName: 'migrations',
          migrations: [
            path.join(__dirname, '..', '..', 'migrations', '*{.ts,.js}'),
          ],
        };
      },
    }),
  ],
})
export class DatabaseModule {}
