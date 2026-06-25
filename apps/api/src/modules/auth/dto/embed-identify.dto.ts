import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class EmbedIdentifyDto {
  @ApiProperty({ example: 'aluno@email.com' })
  @IsEmail()
  email!: string

  @ApiPropertyOptional({ example: '123.456.789-00' })
  @IsOptional()
  @IsString()
  cpf?: string

  @ApiPropertyOptional({ example: '11999999999' })
  @IsOptional()
  @IsString()
  telefone?: string

  @ApiProperty({ description: 'Token público do simulado' })
  @IsString()
  simulado_token!: string
}
