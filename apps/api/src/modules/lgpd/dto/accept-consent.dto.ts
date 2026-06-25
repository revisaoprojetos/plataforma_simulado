import { IsString, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class AcceptConsentDto {
  @ApiProperty({ example: '1.0', description: 'Versão da política aceita' })
  @IsString()
  @IsNotEmpty()
  versao_politica: string
}
