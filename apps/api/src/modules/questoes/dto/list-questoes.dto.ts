import { IsOptional, IsString, IsUUID, IsEnum, IsNumber, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class ListQuestoesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  disciplina_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  banca_id?: string

  @ApiPropertyOptional({ enum: ['rascunho', 'publicada', 'arquivada'] })
  @IsOptional()
  @IsEnum(['rascunho', 'publicada', 'arquivada'])
  status?: string
}
