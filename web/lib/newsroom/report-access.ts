import type { CaseRecord } from "./model";
import { CaseError } from "./model";
import { ReportStore } from "./harness/store";
import { digest, protectionGuard } from "./harness/guard";
import { validateReport } from "./harness/validator";
import { evidenceIds } from "./reporting";
export function requireReviewReport(c:CaseRecord,store=new ReportStore()) {
 protectionGuard()();const text=store.read(c.id,"review");
 if(!text||digest(text)!==c.desks?.review?.hash)throw new CaseError("report_invalid","검토 보고서를 확인할 수 없어 승인을 보류했어요.");
 const meta=validateReport(text,{caseId:c.id,desk:"review",evidenceIds:evidenceIds(c)});
 if(meta.status!=="hold")throw new CaseError("report_invalid","사람 검토 대기 보고서가 필요해요.");
}
