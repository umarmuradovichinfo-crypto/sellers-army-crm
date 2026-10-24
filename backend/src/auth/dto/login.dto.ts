import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: "Email noto'g'ri" })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 ta belgi' })
  password!: string;
}
