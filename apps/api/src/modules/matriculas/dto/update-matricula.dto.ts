import { IsEnum, IsOptional, IsDateString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateMatriculaDto {
  @ApiProperty({ enum: ['ativa', 'expirada', 'cancelada'], required: false })
  @IsOptional()
  @IsEnum(['ativa', 'expirada', 'cancelada'])
  status?: 'ativa' | 'expirada' | 'cancelada'

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  validade?: string

  @ApiProperty({ enum: ['basico', 'pro', 'enterprise'], required: false })
  @IsOptional()
  @IsEnum(['basico', 'pro', 'enterprise'])
  plano?: string
}
