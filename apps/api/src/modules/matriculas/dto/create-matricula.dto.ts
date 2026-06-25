import { IsUUID, IsEnum, IsOptional, IsDateString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateMatriculaDto {
  @ApiProperty({ description: 'ID do estudante' })
  @IsUUID()
  estudante_id: string

  @ApiProperty({ enum: ['basico', 'pro', 'enterprise'], required: false })
  @IsOptional()
  @IsEnum(['basico', 'pro', 'enterprise'])
  plano?: string

  @ApiProperty({ description: 'Data de validade ISO 8601', required: false })
  @IsOptional()
  @IsDateString()
  validade?: string
}
