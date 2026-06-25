import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateSolicitacaoDto {
  @ApiProperty({ enum: ['acesso', 'exclusao', 'portabilidade'] })
  @IsEnum(['acesso', 'exclusao', 'portabilidade'])
  tipo: 'acesso' | 'exclusao' | 'portabilidade'

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observacao?: string
}
