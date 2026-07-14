// Supabase 客户端初始化
const SUPABASE_URL = 'https://edybhreonjracsvnjedr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkeWJocmVvbmpyYWNzdm5qZWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDM1NzMsImV4cCI6MjA5NzgxOTU3M30.DD4luizUgvMEwiAa5PJVWNRNeUEqKkWoH2Mzb2JRRfI';

// 检查 Supabase 是否已加载
if (typeof supabase === 'undefined') {
  console.error('Supabase SDK 未加载，请先引入 supabase.js');
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 用户认证模块
const Auth = {
  // 注册新用户
  async signUp(email, password, plan = 'free') {
    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { plan: plan }
        }
      });
      
      if (error) throw error;
      
      // 注册成功后，profile 会通过数据库触发器自动创建
      return { success: true, user: data.user };
    } catch (error) {
      console.error('注册失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 登录
  async signIn(email, password) {
    try {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error('登录失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 登出
  async signOut() {
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('登出失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 获取当前用户
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await db.auth.getUser();
      if (error) throw error;
      return user;
    } catch (error) {
      console.error('获取用户失败:', error);
      return null;
    }
  },

  // 获取用户 Profile
  async getProfile(userId) {
    try {
      console.log('查询用户 Profile, userId:', userId);
      
      // 先检查登录状态
      const { data: { user: currentUser } } = await db.auth.getUser();
      console.log('当前登录用户:', currentUser?.id);
      
      const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('查询 Profile 失败:', error);
        console.error('错误详情:', error.message, error.code);
        throw error;
      }
      
      console.log('查询成功, profile:', data);
      return data;
    } catch (error) {
      console.error('获取 Profile 失败:', error);
      return null;
    }
  },

  // 更新用户 Profile
  async updateProfile(userId, updates) {
    try {
      const { data, error } = await db
        .from('profiles')
        .update(updates)
        .eq('id', userId);
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('更新 Profile 失败:', error);
      return { success: false, error: error.message };
    }
  }
};

// 额度管理模块
const Quota = {
  // 检查是否有额度
  async checkQuota(userId) {
    try {
      const profile = await Auth.getProfile(userId);
      if (!profile) return { error: '用户不存在' };

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
      
      // 如果是新的一个月，重置付费用户额度
      const currentMonth = new Date().getMonth();
      const resetMonth = profile.last_quota_reset ? new Date(profile.last_quota_reset).getMonth() : null;
      if (resetMonth !== currentMonth && profile.plan !== 'free') {
        await Auth.updateProfile(userId, {
          quota_used: 0,
          last_quota_reset: new Date().toISOString()
        });
        profile.quota_used = 0;
      }
      
      const remaining = profile.quota_limit - profile.quota_used;
      return {
        hasQuota: remaining > 0,
        used: profile.quota_used,
        limit: profile.quota_limit,
        remaining: remaining,
        plan: profile.plan
      };
    } catch (error) {
      console.error('检查额度失败:', error);
      return { error: error.message };
    }
  },

  // 使用一次额度
  async useQuota(userId) {
    try {
      const check = await this.checkQuota(userId);
      if (check.error) return { success: false, error: check.error };
      if (!check.hasQuota) return { success: false, error: '额度已用完' };

      const { success, error } = await Auth.updateProfile(userId, {
        quota_used: check.used + 1
      });

      if (!success) throw new Error(error);
      
      return {
        success: true,
        remaining: check.remaining - 1,
        message: `已使用额度，剩余 ${check.remaining - 1} 次`
      };
    } catch (error) {
      console.error('使用额度失败:', error);
      return { success: false, error: error.message };
    }
  }
};

// 生成记录模块
const Generation = {
  // 记录生成
  async log(userId, params) {
    try {
      const { data, error } = await db
        .from('generations')
        .insert({
          user_id: userId,
          genre: params.genre,
          bpm: params.bpm,
          intensity: params.intensity,
          complexity: params.complexity,
          duration: params.duration,
          prompt: params.prompt
        });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('记录生成失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 获取生成历史
  async getHistory(userId, limit = 20) {
    try {
      const { data, error } = await db
        .from('generations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('获取历史失败:', error);
      return [];
    }
  }
};

// 支付记录模块
const Payment = {
  // 记录支付
  async log(userId, paymentData) {
    try {
      const { data, error } = await db
        .from('payments')
        .insert({
          user_id: userId,
          plan: paymentData.plan,
          amount: paymentData.amount,
          method: paymentData.method,
          transaction_id: paymentData.transactionId,
          status: paymentData.status || 'pending'
        });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('记录支付失败:', error);
      return { success: false, error: error.message };
    }
  }
};

console.log('✅ Supabase 客户端已初始化');
