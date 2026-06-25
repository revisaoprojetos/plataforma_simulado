import { IsString, IsOptional, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateRoleDto {
  @ApiProperty({ example: 'admin_conteudo' })
  @IsString()
  @MaxLength(64)
  nome: string

  @ApiProperty({ example: 'Gerencia questões e simulados', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string
}
