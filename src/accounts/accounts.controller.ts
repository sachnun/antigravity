import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@ApiTags('Accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get account status',
    description: 'Returns status of all configured accounts',
  })
  @ApiResponse({ status: 200, description: 'Account status' })
  getStatus() {
    return this.accountsService.getStatus();
  }
}
