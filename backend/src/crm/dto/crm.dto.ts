import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
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
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() custom?: Record<string, unknown>;
  @IsOptional() @IsArray() items?: any[];
  @IsOptional() @IsBoolean() hot?: boolean;
  @IsOptional() @IsString() nextTask?: string;
  @IsOptional() @IsString() nextTaskDate?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsInt() value?: number;
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
  @IsArray() ids!: string[];
  @IsString() action!: string;
  @IsOptional() value?: any;
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

  @IsOptional() @IsIn(['call', 'meeting', 'message', 'task']) type?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateLeadTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsIn(['call', 'meeting', 'message', 'task']) type?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsString() result?: string;
}
