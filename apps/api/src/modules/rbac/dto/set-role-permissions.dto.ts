import { IsArray, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'Array de permission IDs (UUIDs)' })
  @IsArray()
  @IsUUID('4', { each: true })
  permission_ids: string[]
}
