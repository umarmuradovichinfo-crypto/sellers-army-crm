import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// email normallashtiriladi (trim + kichik harf) — telefon klaviaturasi bosh harfni katta qiladi, oxirida bo'sh joy qoladi
const norm = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class ForgotPasswordDto {
  @norm()
  @IsEmail({}, { message: "Email noto'g'ri" })
  @MaxLength(200)
  email!: string;
}

export class ResetPasswordByCodeDto {
  @norm()
  @IsEmail({}, { message: "Email noto'g'ri" })
  @MaxLength(200)
  email!: string;

  @IsString({ message: 'Kodni kiriting' })
  @MaxLength(20)
  code!: string;

  // parol siyosati — foydalanuvchi yaratish / admin parol berishdagi bilan bir xil (kamida 6 belgi)
  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  @MaxLength(200, { message: 'Parol juda uzun' })
  newPassword!: string;
}
