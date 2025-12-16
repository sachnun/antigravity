import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';

@Module({
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
