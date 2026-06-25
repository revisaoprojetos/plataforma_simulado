import { IsUUID, IsOptional, IsBoolean } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class OpenSessaoDto {
  @ApiPropertyOptional({ default: false, description: 'Sessão de teste (não conta em estatísticas)' })
  @IsOptional()
  @IsBoolean()
  is_teste?: boolean
}
