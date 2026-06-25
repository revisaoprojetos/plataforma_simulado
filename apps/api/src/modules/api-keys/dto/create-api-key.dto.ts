import { IsString, IsArray, IsOptional, IsDateString, ArrayNotEmpty, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Nome descritivo da chave' })
  @IsString()
  @MinLength(1)
  nome: string

  @ApiProperty({
    description: 'Lista de escopos',
    example: ['questoes:create', 'import:run'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  escopos: string[]

  @ApiProperty({ description: 'Data de expiração ISO 8601 (opcional)', required: false })
  @IsOptional()
  @IsDateString()
  expira_em?: string
}
