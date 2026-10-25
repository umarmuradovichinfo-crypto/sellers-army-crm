import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SetPermissionDto {
  @IsString()
  roleKey!: string;

  @IsString()
  permission!: string;

  @IsBoolean()
  allowed!: boolean;
}

export class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: 'Rol nomi majburiy' })
  name!: string;
}

// ── Foydalanuvchi (login/parol) ──
export class CreateUserDto {
  @IsString()
  @MinLength(1, { message: 'Ism majburiy' })
  name!: string;

  @IsEmail({}, { message: "Email noto'g'ri" })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  password!: string;

  @IsString()
  roleKey!: string;

  @IsOptional()
  @IsString()
  extension?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email noto'g'ri" })
  email?: string;

  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  extension?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  password!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgi' })
  password!: string;
}

export class SaveProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email noto'g'ri" })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
