import { Module, forwardRef } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [forwardRef(() => AccountsModule)],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
