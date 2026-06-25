import { IsString, IsUrl, IsOptional, IsObject } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTenantDto {
  @ApiProperty({ example: 'Revisão PGE' })
  @IsString()
  nome!: string

  @ApiProperty({ example: 'revisaopge.plataforma.com' })
  @IsString()
  dominio!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  tema?: Record<string, unknown>

  @ApiPropertyOptional({ example: 'basico' })
  @IsOptional()
  @IsString()
  plano?: string
}
