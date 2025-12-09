import { Controller, Get } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('status')
  getStatus() {
    return this.accountsService.getStatus();
  }
}
