import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsUUID,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateUserDto {
  @ApiProperty({ example: 'aluno@email.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(8)
  password!: string

  @ApiProperty({ example: 'Ana Luiza' })
  @IsString()
  nome!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenant_id?: string

  @ApiPropertyOptional({ example: 'estudante' })
  @IsOptional()
  @IsString()
  role?: string
}
