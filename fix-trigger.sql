-- 修复数据库触发器，确保注册时自动创建 profile

-- 1. 检查触发器是否存在
SELECT tgname, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';

-- 2. 确保 handle_new_user 函数存在
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan, quota_used, quota_limit, last_quota_reset)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'plan', 'free'),
    0,
    CASE 
      WHEN COALESCE(NEW.raw_user_meta_data->>'plan', 'free') = 'starter' THEN 30
      WHEN COALESCE(NEW.raw_user_meta_data->>'plan', 'free') = 'pro' THEN 200
      ELSE 3
    END,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4. 创建新触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. 测试：查看已有用户是否有 profile
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'plan' as meta_plan,
  p.plan as profile_plan,
  p.quota_limit,
  p.quota_used,
  CASE WHEN p.id IS NULL THEN '❌ 缺少 profile' ELSE '✅ 正常' END as status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id;

-- 6. 修复缺失的 profile（如果上面查询显示有缺失）
INSERT INTO profiles (id, email, plan, quota_used, quota_limit, last_quota_reset)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'plan', 'free'),
  0,
  CASE 
    WHEN COALESCE(u.raw_user_meta_data->>'plan', 'free') = 'starter' THEN 30
    WHEN COALESCE(u.raw_user_meta_data->>'plan', 'free') = 'pro' THEN 200
    ELSE 3
  END,
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
);
