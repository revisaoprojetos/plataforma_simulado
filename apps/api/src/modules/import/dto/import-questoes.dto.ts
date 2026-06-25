import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  ArrayNotEmpty,
  ValidateNested,
  IsBoolean,
  MinLength,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class ImportAlternativaDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  texto: string

  @ApiProperty()
  @IsBoolean()
  correta: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  ordem?: number
}

export class ImportQuestaoDto {
  @ApiProperty({ description: 'ID externo para deduplicação', required: false })
  @IsOptional()
  @IsString()
  external_id?: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  enunciado: string

  @ApiProperty({ enum: ['objetiva', 'discursiva'], default: 'objetiva' })
  @IsOptional()
  @IsEnum(['objetiva', 'discursiva'])
  tipo?: string

  @ApiProperty({ type: [ImportAlternativaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportAlternativaDto)
  alternativas: ImportAlternativaDto[]

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  disciplina_nome?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  banca_nome?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nivel_dificuldade?: string

  @ApiProperty({ required: false })
  @IsOptional()
  ano?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comentario_professor?: string
}

export class ImportQuestoesDto {
  @ApiProperty({ type: [ImportQuestaoDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportQuestaoDto)
  questoes: ImportQuestaoDto[]
}
