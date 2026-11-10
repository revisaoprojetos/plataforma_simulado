import { Global, Module } from '@nestjs/common';
import { Env, parseEnv } from './env';

export const CONFIG = Symbol('CONFIG');

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: (): Env => parseEnv() }],
  exports: [CONFIG],
})
export class ConfigModule {}
