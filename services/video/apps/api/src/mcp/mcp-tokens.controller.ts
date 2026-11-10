import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CreateTokenDto, createTokenSchema, McpTokensService } from './mcp-tokens.service';

/** Gestão dos tokens pessoais do MCP. Só com login (JWT): um token MCP não cria outros tokens. */
@ApiTags('mcp')
@ApiBearerAuth()
@Controller('me/mcp-tokens')
export class McpTokensController {
  constructor(private readonly tokens: McpTokensService) {}

  @Post()
  create(@Tenant() user: TenantUser, @Body(new ZodPipe(createTokenSchema)) dto: CreateTokenDto) {
    return this.tokens.create(user, dto);
  }

  @Get()
  list(@Tenant() user: TenantUser) {
    return this.tokens.list(user);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tokens.revoke(user, id);
  }
}
