import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { validate } from './config/env.validation';
import * as path from 'path';

validate(process.env as Record<string, unknown>);
const configService = new ConfigService(process.env);

export default new DataSource({
  type: 'mysql',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_NAME'),
  entities: [path.join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  migrationsTableName: 'migrations',
});
