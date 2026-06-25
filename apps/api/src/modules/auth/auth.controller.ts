import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { AuthService } from './auth.service.js'
import { LoginDto } from './dto/login.dto.js'
import { RefreshTokenDto } from './dto/refresh-token.dto.js'
import { EmbedIdentifyDto } from './dto/embed-identify.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'

type TenantRequest = Request & { tenantId: string; user?: { id: string; email: string } }

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login com email e senha' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token via refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar sessão' })
  logout(@Req() req: TenantRequest) {
    return this.authService.logout(req.user!.id)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@Req() req: TenantRequest) {
    return this.authService.me(req.user!.id)
  }

  @Post('embed/identify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Identificação leve do aluno para área embedável' })
  embedIdentify(@Body() dto: EmbedIdentifyDto, @Req() req: TenantRequest) {
    return this.authService.embedIdentify(dto, req.tenantId)
  }
}
