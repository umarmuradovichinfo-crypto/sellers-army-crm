import {
  IsArray,
  IsBoolean,
  IsIn,
  Matches,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStageDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsIn(['open', 'won', 'lost'])
  kind?: string;

  @IsOptional()
  @IsString()
  pipelineId?: string;
}

export class UpdateStageDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(['open', 'won', 'lost']) kind?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsObject() hints?: Record<string, string>;
}

export class CreateLeadDto {
  @IsString()
  @MinLength(1, { message: 'Ism majburiy' })
  name!: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsInt() @Min(0, { message: 'Byudjet manfiy bo`lmaydi' }) @Max(2000000000, { message: 'Byudjet juda katta' }) value?: number;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() custom?: Record<string, unknown>;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsBoolean() hot?: boolean;
  @IsOptional() @IsString() nextTask?: string;
  @IsOptional() @IsString() nextTaskDate?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactId?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsInt() @Min(0, { message: 'Byudjet manfiy bo`lmaydi' }) @Max(2000000000, { message: 'Byudjet juda katta' }) value?: number;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() custom?: Record<string, unknown>;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsBoolean() hot?: boolean;
  @IsOptional() @IsString() nextTask?: string;
  @IsOptional() @IsString() nextTaskDate?: string;
  @IsOptional() @IsString() lostReason?: string;
  @IsOptional() @IsString() contactId?: string;
}

export class MoveLeadDto {
  @IsString()
  stageId!: string;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class BulkDto {
  @IsOptional() @IsArray() ids?: string[];
  @IsString() action!: string;
  @IsOptional() value?: any;
  // "Barchasini belgilash": ids o'rniga filtr (GET /crm/leads bilan bir xil parametrlar), excludeIds — olib tashlanganlar
  @IsOptional() @IsBoolean() all?: boolean;
  @IsOptional() filter?: Record<string, any>;
  @IsOptional() @IsArray() excludeIds?: string[];
}

export class AddNoteDto {
  @IsString()
  @MinLength(1)
  text!: string;
}

export class CreateLeadTaskDto {
  @IsString()
  @MinLength(1, { message: 'Vazifa nomi majburiy' })
  title!: string;

  // standart (call|meeting|message|task) yoki o'z turi (Sozlamalar → vazifa turlari, kalit t_...)
  @IsOptional() @Matches(/^[\w-]{1,40}$/) type?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateLeadTaskDto {
  @IsOptional() @IsString() title?: string;
  // standart (call|meeting|message|task) yoki o'z turi (Sozlamalar → vazifa turlari, kalit t_...)
  @IsOptional() @Matches(/^[\w-]{1,40}$/) type?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsString() result?: string;
}
