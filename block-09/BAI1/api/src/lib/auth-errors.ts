const definitions = {
  INVALID_CREDENTIALS: [200, 'Email hoặc mật khẩu chưa đúng.'],
  ACCOUNT_NOT_ACTIVATED: [200, 'Vui lòng xác minh email và kích hoạt tài khoản.'],
  INVALID_OTP: [200, 'Mã xác minh không hợp lệ, đã dùng hoặc hết hạn.'],
  INVALID_RESET_TOKEN: [200, 'Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc hết hạn.'],
  CAPTCHA_REQUIRED: [200, 'Vui lòng hoàn thành CAPTCHA.'],
  INVALID_CAPTCHA: [200, 'CAPTCHA không hợp lệ hoặc đã hết hạn.'],
  VALIDATION_FAILED: [200, 'Dữ liệu không hợp lệ.'],
  RATE_LIMITED: [429, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'],
  UNAUTHENTICATED: [401, 'Vui lòng đăng nhập lại.'],
  INVALID_REFRESH_TOKEN: [401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'],
  REFRESH_TOKEN_REUSED: [401, 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.'],
  CSRF_INVALID: [403, 'CSRF token không hợp lệ.'],
  ORIGIN_FORBIDDEN: [403, 'Origin không được phép.'],
  AUTH_SERVICE_UNAVAILABLE: [503, 'Dịch vụ xác thực chưa được kết nối hoặc cấu hình.'],
} as const;

export type AuthErrorCode = keyof typeof definitions;
export class AuthError extends Error {
  readonly status: number;
  constructor(public readonly code: AuthErrorCode, public readonly fields?: Record<string, string>, public readonly retryAfter?: number) {
    super(definitions[code][1]);
    this.name = 'AuthError';
    this.status = definitions[code][0];
  }
}
