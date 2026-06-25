import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
  Max,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AlternativaDto {
  @ApiProperty({ example: 'Alternativa A' })
  @IsString()
  texto!: string

  @ApiProperty({ example: false })
  @IsBoolean()
  correta!: boolean

  @ApiProperty({ example: 0 })
  @IsNumber()
  ordem!: number
}

export class CreateQuestaoDto {
  @ApiPropertyOptional({ example: 'CESPE-2023-001' })
  @IsOptional()
  @IsString()
  external_id?: string

  @ApiProperty({ enum: ['objetiva', 'discursiva'], default: 'objetiva' })
  @IsEnum(['objetiva', 'discursiva'])
  tipo!: 'objetiva' | 'discursiva'

  @ApiProperty({ example: 'Qual é a capital do Brasil?' })
  @IsString()
  enunciado!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  banca_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orgao_id?: string

  @ApiPropertyOptional({ example: 2023 })
  @IsOptional()
  @IsNumber()
  ano?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  disciplina_id?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assunto_id?: string

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  nivel_dificuldade?: number

  @ApiPropertyOptional({ enum: ['oficial', 'extraoficial'], default: 'oficial' })
  @IsOptional()
  @IsEnum(['oficial', 'extraoficial'])
  gabarito_tipo?: 'oficial' | 'extraoficial'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comentario_professor?: string

  @ApiPropertyOptional({
    type: [AlternativaDto],
    description: 'Obrigatório para tipo objetiva',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlternativaDto)
  alternativas?: AlternativaDto[]
}
