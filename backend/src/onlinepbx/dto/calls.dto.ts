import { IsOptional, IsString } from 'class-validator';

export class ClickCallDto {
  @IsOptional()
  @IsString()
  from?: string; // ixtiyoriy: ichki raqamni override qilish
}

export class ExtensionDto {
  @IsString()
  extension!: string;
}
