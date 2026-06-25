import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsObject,
  Min,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSimuladoDto {
  @ApiProperty({ example: 'Simulado PGE 2024 - 1ª Fase' })
  @IsString()
  titulo!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string

  @ApiProperty({
    enum: ['janela_fixa', 'prazo_relativo', 'aberto'],
    default: 'janela_fixa',
  })
  @IsEnum(['janela_fixa', 'prazo_relativo', 'aberto'])
  modo_aplicacao!: 'janela_fixa' | 'prazo_relativo' | 'aberto'

  @ApiPropertyOptional({ example: '2024-12-01T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_inicio?: string

  @ApiPropertyOptional({ example: '2024-12-01T13:00:00Z' })
  @IsOptional()
  @IsDateString()
  data_fim?: string

  @ApiPropertyOptional({ example: 300, description: 'Tempo limite em minutos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  tempo_limite_min?: number

  @ApiPropertyOptional({
    enum: ['email', 'email_cpf', 'email_telefone'],
  })
  @IsOptional()
  @IsEnum(['email', 'email_cpf', 'email_telefone'])
  metodo_identificacao?: string

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  embed_ativo?: boolean

  @ApiPropertyOptional({
    description: 'Regras do simulado (retentativas, embaralhamento, etc.)',
  })
  @IsOptional()
  @IsObject()
  regras?: {
    retentativas?: number | 'ilimitado'
    politica_nota?: 'ultima' | 'melhor' | 'media'
    embaralhar_questoes?: boolean
    embaralhar_alternativas?: boolean
    permitir_iniciar_atrasado?: boolean
    tempo_proporcional_se_atrasado?: boolean
    liberacao_gabarito?: 'imediato' | 'apos_janela' | 'manual'
    revisao_antes_enviar?: boolean
    politica_anulacao?: 'pontua_todos' | 'desconsidera'
  }
}
