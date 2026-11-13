export interface ApprovalTokenPayload {
  task_id: string;
  step_id: string;
  nonce: string;
}

export interface TokenVerifyResult {
  valid: boolean;
  payload: ApprovalTokenPayload | null;
}

export interface IssuedApprovalToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}
