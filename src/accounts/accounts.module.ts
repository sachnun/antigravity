import { Module, Global } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { QuotaModule } from '../quota/quota.module';

@Global()
@Module({
  imports: [QuotaModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
