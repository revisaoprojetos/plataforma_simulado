import { IsUUID, IsNumber, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class SaveRespostaDto {
  @ApiProperty({ description: 'ID da questão' })
  @IsUUID()
  questao_id!: string

  @ApiProperty({ description: 'ID da alternativa selecionada' })
  @IsUUID()
  alternativa_id!: string

  @ApiPropertyOptional({ description: 'Tempo gasto em segundos' })
  @IsOptional()
  @IsNumber()
  tempo_resposta_seg?: number
}
