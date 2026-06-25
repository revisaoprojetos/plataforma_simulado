import { IsString, IsUrl, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateWebhookDto {
  @ApiProperty({ description: 'URL de destino do webhook', example: 'https://minha-plataforma.com/webhook' })
  @IsUrl()
  url: string

  @ApiProperty({ description: 'Evento que dispara o webhook', example: 'questao.importada' })
  @IsString()
  @MinLength(1)
  evento: string

  @ApiProperty({ description: 'Segredo HMAC para assinar o payload' })
  @IsString()
  @MinLength(8)
  segredo_hmac: string
}
