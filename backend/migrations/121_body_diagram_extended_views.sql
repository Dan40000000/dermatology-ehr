-- Extend body diagram to support left and right side views
-- Migration for enhanced anatomical body diagram with 4 views: front, back, left, right

-- Remove the existing check constraint if it exists
ALTER TABLE patient_body_markings
DROP CONSTRAINT IF EXISTS patient_body_markings_view_type_check;

-- Update the column to allow all 4 view types
-- Note: PostgreSQL doesn't have a simple way to alter enum-like varchar constraints,
-- so we'll use a check constraint instead

ALTER TABLE patient_body_markings
ADD CONSTRAINT patient_body_markings_view_type_check
CHECK (view_type IN ('front', 'back', 'left', 'right'));

-- Add new body locations for side views
INSERT INTO body_locations (code, name, category, svg_coordinates) VALUES
-- Left side view locations
('side-left-head', 'Head (Left Profile)', 'head', '{"left": {"x": 50, "y": 8}}'::jsonb),
('side-left-shoulder', 'Shoulder (Left Side)', 'arm_left', '{"left": {"x": 45, "y": 22}}'::jsonb),
('side-left-arm', 'Arm (Left Side)', 'arm_left', '{"left": {"x": 35, "y": 45}}'::jsonb),
('side-left-torso', 'Torso (Left Side)', 'trunk', '{"left": {"x": 50, "y": 45}}'::jsonb),
('side-left-hip', 'Hip (Left Side)', 'trunk', '{"left": {"x": 45, "y": 55}}'::jsonb),
('side-left-leg', 'Leg (Left Side)', 'leg_left', '{"left": {"x": 48, "y": 75}}'::jsonb),

-- Right side view locations
('side-right-head', 'Head (Right Profile)', 'head', '{"right": {"x": 50, "y": 8}}'::jsonb),
('side-right-shoulder', 'Shoulder (Right Side)', 'arm_right', '{"right": {"x": 55, "y": 22}}'::jsonb),
('side-right-arm', 'Arm (Right Side)', 'arm_right', '{"right": {"x": 65, "y": 45}}'::jsonb),
('side-right-torso', 'Torso (Right Side)', 'trunk', '{"right": {"x": 50, "y": 45}}'::jsonb),
('side-right-hip', 'Hip (Right Side)', 'trunk', '{"right": {"x": 55, "y": 55}}'::jsonb),
('side-right-leg', 'Leg (Right Side)', 'leg_right', '{"right": {"x": 52, "y": 75}}'::jsonb),

-- Add custom location for freeform markers
('custom', 'Custom Location', 'other', '{"front": {"x": 50, "y": 50}, "back": {"x": 50, "y": 50}, "left": {"x": 50, "y": 50}, "right": {"x": 50, "y": 50}}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Add comment
COMMENT ON COLUMN patient_body_markings.view_type IS 'Which view the marking appears on: front, back, left, or right';
