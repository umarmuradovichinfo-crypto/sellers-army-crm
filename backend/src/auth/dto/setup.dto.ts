import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SetupDto {
  @IsString({ message: "Ism kiritilishi shart" })
  @MinLength(1, { message: 'Ism kiritilishi shart' })
  name!: string;

  @IsEmail({}, { message: "Email noto'g'ri" })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Parol kamida 8 ta belgi' })
  password!: string;

  @IsOptional()
  @IsString()
  setupToken?: string;
}
