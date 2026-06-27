// Supabase 配置
const SUPABASE_URL = 'https://edybhreonjracsvnjedr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkeWJocmVvbmpyYWNzdm5qZWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDM1NzMsImV4cCI6MjA5NzgxOTU3M30.DD4luizUgvMEwiAa5PJVWNRNeUEqKkWoH2Mzb2JRRfI';

// 初始化 Supabase 客户端
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 用户认证相关函数
const Auth = {
  // 注册新用户
  async signUp(email, password, plan = 'free') {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          plan: plan,
          quota_used: 0,
          quota_limit: plan === 'free' ? 3 : (plan === 'starter' ? 30 : 200),
          created_at: new Date().toISOString()
        }
      }
    });
    
    if (error) throw error;
    return data;
  },

  // 登录
  async signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return data;
  },

  // 登出
  async signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  },

  // 获取当前用户
  async getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  },

  // 获取用户 Profile
  async getProfile(userId) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  },

  // 更新用户 Profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', userId);
    
    if (error) throw error;
    return data;
  }
};

// 额度管理相关函数
const Quota = {
  // 检查是否有额度
  async checkQuota(userId) {
    const profile = await Auth.getProfile(userId);
    const today = new Date().toDateString();
    const lastReset = profile.last_quota_reset ? new Date(profile.last_quota_reset).toDateString() : null;
    
    // 如果是新的一天，重置免费额度
    if (lastReset !== today && profile.plan === 'free') {
      await Auth.updateProfile(userId, {
        quota_used: 0,
        last_quota_reset: new Date().toISOString()
      });
      profile.quota_used = 0;
    }
    
    return {
      used: profile.quota_used,
      limit: profile.quota_limit,
      remaining: profile.quota_limit - profile.quota_used,
      plan: profile.plan
    };
  },

  // 使用一次额度
  async useQuota(userId) {
    const profile = await Auth.getProfile(userId);
    const today = new Date().toDateString();
    const lastReset = profile.last_quota_reset ? new Date(profile.last_quota_reset).toDateString() : null;
    
    // 如果是新的一天，重置免费额度
    if (lastReset !== today && profile.plan === 'free') {
      await Auth.updateProfile(userId, {
        quota_used: 1,
        last_quota_reset: new Date().toISOString()
      });
      return { success: true, remaining: profile.quota_limit - 1 };
    }
    
    // 检查是否还有额度
    if (profile.quota_used >= profile.quota_limit) {
      return { success: false, message: '额度已用完，请升级方案' };
    }
    
    // 使用额度
    const newUsed = profile.quota_used + 1;
    await Auth.updateProfile(userId, {
      quota_used: newUsed,
      last_quota_reset: profile.last_quota_reset || new Date().toISOString()
    });
    
    return { success: true, remaining: profile.quota_limit - newUsed };
  },

  // 记录生成历史
  async logGeneration(userId, params, result) {
    const { data, error } = await supabaseClient
      .from('generations')
      .insert({
        user_id: userId,
        genre: params.genre,
        bpm: params.bpm,
        intensity: params.intensity,
        complexity: params.complexity,
        duration: params.duration,
        prompt: params.prompt,
        result_url: result.url,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    return data;
  },

  // 获取生成历史
  async getHistory(userId, limit = 20) {
    const { data, error } = await supabaseClient
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }
};

// 支付相关函数
const Payment = {
  // 记录支付
  async recordPayment(userId, plan, amount, method, txnId) {
    const { data, error } = await supabaseClient
      .from('payments')
      .insert({
        user_id: userId,
        plan: plan,
        amount: amount,
        method: method,
        transaction_id: txnId,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
    return data;
  },

  // 更新支付状态
  async updatePaymentStatus(paymentId, status) {
    const { data, error } = await supabaseClient
      .from('payments')
      .update({ status: status })
      .eq('id', paymentId);
    
    if (error) throw error;
    return data;
  },

  // 升级用户方案
  async upgradePlan(userId, plan) {
    const quotaLimits = {
      'free': 3,
      'starter': 30,
      'pro': 200,
      'enterprise': 999999
    };
    
    await Auth.updateProfile(userId, {
      plan: plan,
      quota_limit: quotaLimits[plan],
      quota_used: 0,
      last_quota_reset: new Date().toISOString()
    });
  }
};

// 导出所有函数
window.SonicForge = {
  Auth,
  Quota,
  Payment,
  client: supabaseClient
};

console.log('SonicForge Backend initialized');
