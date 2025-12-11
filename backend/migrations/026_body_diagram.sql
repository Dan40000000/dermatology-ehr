-- Body Diagram System for Dermatology EHR
-- Enables marking and tracking of skin lesions, examined areas, biopsies, excisions, etc.

-- Body location reference table
create table if not exists body_locations (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique, -- e.g., 'face-nose', 'trunk-chest', 'arm-left-upper'
  name varchar(255) not null,
  category varchar(100) not null, -- head, trunk, arm_left, arm_right, leg_left, leg_right
  svg_coordinates jsonb, -- {front: {x, y}, back: {x, y}} for SVG mapping
  created_at timestamp default current_timestamp
);

-- Patient body markings (lesions, examined areas, etc)
create table if not exists patient_body_markings (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  patient_id uuid not null references patients(id) on delete cascade,
  encounter_id uuid references encounters(id) on delete set null,

  -- Location information
  location_code varchar(50) not null references body_locations(code),
  location_x numeric(5,2), -- precise X coordinate on SVG (0-100)
  location_y numeric(5,2), -- precise Y coordinate on SVG (0-100)
  view_type varchar(20) not null default 'front', -- front or back

  -- Marking type
  marking_type varchar(50) not null, -- lesion, examined, biopsy, excision, injection

  -- Clinical details
  diagnosis_code varchar(20), -- ICD-10 code
  diagnosis_description text,
  lesion_type varchar(100), -- melanoma, basal_cell, squamous_cell, nevus, acne, etc
  lesion_size_mm numeric(10,2), -- size in millimeters
  lesion_color varchar(50), -- brown, black, red, pink, white, etc

  -- Status tracking
  status varchar(50) default 'active', -- active, resolved, monitored, biopsied, excised
  examined_date date,
  resolved_date date,

  -- Clinical notes
  description text,
  treatment_notes text,

  -- Links to documentation
  photo_ids jsonb default '[]'::jsonb, -- array of photo document IDs

  -- Audit fields
  created_by uuid not null references users(id),
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Indexes for performance
create index if not exists idx_body_markings_patient on patient_body_markings(patient_id);
create index if not exists idx_body_markings_encounter on patient_body_markings(encounter_id);
create index if not exists idx_body_markings_location on patient_body_markings(location_code);
create index if not exists idx_body_markings_status on patient_body_markings(status);
create index if not exists idx_body_markings_tenant on patient_body_markings(tenant_id);
create index if not exists idx_body_markings_marking_type on patient_body_markings(marking_type);

-- Seed common body locations with anatomically accurate coordinates
insert into body_locations (code, name, category, svg_coordinates) values
-- Head/Face
('head-scalp', 'Scalp', 'head', '{"front": {"x": 50, "y": 8}, "back": {"x": 50, "y": 8}}'::jsonb),
('face-forehead', 'Forehead', 'head', '{"front": {"x": 50, "y": 12}}'::jsonb),
('face-temple-left', 'Left Temple', 'head', '{"front": {"x": 38, "y": 14}}'::jsonb),
('face-temple-right', 'Right Temple', 'head', '{"front": {"x": 62, "y": 14}}'::jsonb),
('face-nose', 'Nose', 'head', '{"front": {"x": 50, "y": 16}}'::jsonb),
('face-cheek-left', 'Left Cheek', 'head', '{"front": {"x": 40, "y": 18}}'::jsonb),
('face-cheek-right', 'Right Cheek', 'head', '{"front": {"x": 60, "y": 18}}'::jsonb),
('face-chin', 'Chin', 'head', '{"front": {"x": 50, "y": 22}}'::jsonb),
('ear-left', 'Left Ear', 'head', '{"front": {"x": 35, "y": 16}, "back": {"x": 35, "y": 16}}'::jsonb),
('ear-right', 'Right Ear', 'head', '{"front": {"x": 65, "y": 16}, "back": {"x": 65, "y": 16}}'::jsonb),
('neck-front', 'Neck (Front)', 'head', '{"front": {"x": 50, "y": 26}}'::jsonb),
('neck-back', 'Neck (Back)', 'head', '{"back": {"x": 50, "y": 26}}'::jsonb),
('neck-side-left', 'Neck (Left Side)', 'head', '{"front": {"x": 42, "y": 26}, "back": {"x": 42, "y": 26}}'::jsonb),
('neck-side-right', 'Neck (Right Side)', 'head', '{"front": {"x": 58, "y": 26}, "back": {"x": 58, "y": 26}}'::jsonb),

-- Trunk - Anterior
('chest-upper', 'Upper Chest', 'trunk', '{"front": {"x": 50, "y": 32}}'::jsonb),
('chest-right', 'Right Chest', 'trunk', '{"front": {"x": 40, "y": 36}}'::jsonb),
('chest-left', 'Left Chest', 'trunk', '{"front": {"x": 60, "y": 36}}'::jsonb),
('abdomen-upper', 'Upper Abdomen', 'trunk', '{"front": {"x": 50, "y": 44}}'::jsonb),
('abdomen-lower', 'Lower Abdomen', 'trunk', '{"front": {"x": 50, "y": 52}}'::jsonb),
('abdomen-right', 'Right Abdomen', 'trunk', '{"front": {"x": 42, "y": 48}}'::jsonb),
('abdomen-left', 'Left Abdomen', 'trunk', '{"front": {"x": 58, "y": 48}}'::jsonb),

-- Trunk - Posterior
('back-upper', 'Upper Back', 'trunk', '{"back": {"x": 50, "y": 35}}'::jsonb),
('back-middle', 'Middle Back', 'trunk', '{"back": {"x": 50, "y": 43}}'::jsonb),
('back-lower', 'Lower Back', 'trunk', '{"back": {"x": 50, "y": 51}}'::jsonb),
('back-right', 'Right Back', 'trunk', '{"back": {"x": 42, "y": 43}}'::jsonb),
('back-left', 'Left Back', 'trunk', '{"back": {"x": 58, "y": 43}}'::jsonb),
('buttock-right', 'Right Buttock', 'trunk', '{"back": {"x": 45, "y": 58}}'::jsonb),
('buttock-left', 'Left Buttock', 'trunk', '{"back": {"x": 55, "y": 58}}'::jsonb),

-- Arms - Right
('shoulder-right', 'Right Shoulder', 'arm_right', '{"front": {"x": 70, "y": 32}, "back": {"x": 70, "y": 32}}'::jsonb),
('arm-right-upper', 'Right Upper Arm', 'arm_right', '{"front": {"x": 75, "y": 40}, "back": {"x": 75, "y": 40}}'::jsonb),
('arm-right-elbow', 'Right Elbow', 'arm_right', '{"front": {"x": 78, "y": 50}, "back": {"x": 78, "y": 50}}'::jsonb),
('arm-right-forearm', 'Right Forearm', 'arm_right', '{"front": {"x": 80, "y": 58}, "back": {"x": 80, "y": 58}}'::jsonb),
('wrist-right', 'Right Wrist', 'arm_right', '{"front": {"x": 82, "y": 66}, "back": {"x": 82, "y": 66}}'::jsonb),
('hand-right-palm', 'Right Palm', 'arm_right', '{"front": {"x": 84, "y": 70}}'::jsonb),
('hand-right-back', 'Right Hand (Back)', 'arm_right', '{"back": {"x": 84, "y": 70}}'::jsonb),
('hand-right-fingers', 'Right Fingers', 'arm_right', '{"front": {"x": 84, "y": 74}, "back": {"x": 84, "y": 74}}'::jsonb),

-- Arms - Left
('shoulder-left', 'Left Shoulder', 'arm_left', '{"front": {"x": 30, "y": 32}, "back": {"x": 30, "y": 32}}'::jsonb),
('arm-left-upper', 'Left Upper Arm', 'arm_left', '{"front": {"x": 25, "y": 40}, "back": {"x": 25, "y": 40}}'::jsonb),
('arm-left-elbow', 'Left Elbow', 'arm_left', '{"front": {"x": 22, "y": 50}, "back": {"x": 22, "y": 50}}'::jsonb),
('arm-left-forearm', 'Left Forearm', 'arm_left', '{"front": {"x": 20, "y": 58}, "back": {"x": 20, "y": 58}}'::jsonb),
('wrist-left', 'Left Wrist', 'arm_left', '{"front": {"x": 18, "y": 66}, "back": {"x": 18, "y": 66}}'::jsonb),
('hand-left-palm', 'Left Palm', 'arm_left', '{"front": {"x": 16, "y": 70}}'::jsonb),
('hand-left-back', 'Left Hand (Back)', 'arm_left', '{"back": {"x": 16, "y": 70}}'::jsonb),
('hand-left-fingers', 'Left Fingers', 'arm_left', '{"front": {"x": 16, "y": 74}, "back": {"x": 16, "y": 74}}'::jsonb),

-- Pelvis/Groin
('groin-right', 'Right Groin', 'trunk', '{"front": {"x": 45, "y": 58}}'::jsonb),
('groin-left', 'Left Groin', 'trunk', '{"front": {"x": 55, "y": 58}}'::jsonb),

-- Legs - Right
('hip-right', 'Right Hip', 'leg_right', '{"front": {"x": 43, "y": 60}, "back": {"x": 43, "y": 60}}'::jsonb),
('thigh-right-front', 'Right Thigh (Front)', 'leg_right', '{"front": {"x": 43, "y": 70}}'::jsonb),
('thigh-right-back', 'Right Thigh (Back)', 'leg_right', '{"back": {"x": 43, "y": 70}}'::jsonb),
('knee-right', 'Right Knee', 'leg_right', '{"front": {"x": 43, "y": 78}, "back": {"x": 43, "y": 78}}'::jsonb),
('shin-right', 'Right Shin', 'leg_right', '{"front": {"x": 43, "y": 86}}'::jsonb),
('calf-right', 'Right Calf', 'leg_right', '{"back": {"x": 43, "y": 86}}'::jsonb),
('ankle-right', 'Right Ankle', 'leg_right', '{"front": {"x": 43, "y": 92}, "back": {"x": 43, "y": 92}}'::jsonb),
('foot-right-top', 'Right Foot (Top)', 'leg_right', '{"front": {"x": 43, "y": 96}}'::jsonb),
('foot-right-bottom', 'Right Foot (Bottom)', 'leg_right', '{"back": {"x": 43, "y": 96}}'::jsonb),

-- Legs - Left
('hip-left', 'Left Hip', 'leg_left', '{"front": {"x": 57, "y": 60}, "back": {"x": 57, "y": 60}}'::jsonb),
('thigh-left-front', 'Left Thigh (Front)', 'leg_left', '{"front": {"x": 57, "y": 70}}'::jsonb),
('thigh-left-back', 'Left Thigh (Back)', 'leg_left', '{"back": {"x": 57, "y": 70}}'::jsonb),
('knee-left', 'Left Knee', 'leg_left', '{"front": {"x": 57, "y": 78}, "back": {"x": 57, "y": 78}}'::jsonb),
('shin-left', 'Left Shin', 'leg_left', '{"front": {"x": 57, "y": 86}}'::jsonb),
('calf-left', 'Left Calf', 'leg_left', '{"back": {"x": 57, "y": 86}}'::jsonb),
('ankle-left', 'Left Ankle', 'leg_left', '{"front": {"x": 57, "y": 92}, "back": {"x": 57, "y": 92}}'::jsonb),
('foot-left-top', 'Left Foot (Top)', 'leg_left', '{"front": {"x": 57, "y": 96}}'::jsonb),
('foot-left-bottom', 'Left Foot (Bottom)', 'leg_left', '{"back": {"x": 57, "y": 96}}'::jsonb)
on conflict (code) do nothing;

-- Add audit trigger for body markings
create or replace function update_body_marking_timestamp()
returns trigger as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$ language plpgsql;

create trigger body_marking_updated
  before update on patient_body_markings
  for each row
  execute function update_body_marking_timestamp();

-- Add comments for documentation
comment on table body_locations is 'Reference table for anatomical body locations used in the body diagram';
comment on table patient_body_markings is 'Patient-specific markings on the body diagram (lesions, examined areas, procedures)';
comment on column patient_body_markings.marking_type is 'Type of marking: lesion, examined, biopsy, excision, injection';
comment on column patient_body_markings.status is 'Current status: active, resolved, monitored, biopsied, excised';
comment on column patient_body_markings.location_x is 'X coordinate on SVG (0-100 scale)';
comment on column patient_body_markings.location_y is 'Y coordinate on SVG (0-100 scale)';
comment on column patient_body_markings.view_type is 'Which view the marking appears on: front or back';
