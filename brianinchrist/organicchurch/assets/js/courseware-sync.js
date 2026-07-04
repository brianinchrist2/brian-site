/**
 * 课件数据同步模块
 * 将 localStorage 数据同步到服务端 D1 数据库
 */

window.CoursewareSync = (function() {
  const API_BASE = '/api/modules/students';
  
  let token = localStorage.getItem('auth_token');
  
  function setToken(newToken) {
    token = newToken;
    localStorage.setItem('auth_token', newToken);
  }
  
  function clearToken() {
    token = null;
    localStorage.removeItem('auth_token');
  }
  
  async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  }
  
  /**
   * 同步答题记录到服务端
   */
  async function syncAnswers(itemId, questionIndex, questionText, answerText) {
    if (!token) {
      console.warn('Not logged in, skipping sync');
      return;
    }
    
    try {
      await apiRequest('/answers', 'POST', {
        itemId,
        questionIndex,
        questionText,
        answerText
      });
    } catch (err) {
      console.error('Failed to sync answer:', err);
    }
  }
  
  /**
   * 同步学习进度到服务端
   */
  async function syncProgress(itemId, courseId, status, score = null) {
    if (!token) {
      console.warn('Not logged in, skipping sync');
      return;
    }
    
    try {
      await apiRequest('/progress', 'POST', {
        itemId,
        courseId,
        status,
        score
      });
    } catch (err) {
      console.error('Failed to sync progress:', err);
    }
  }
  
  /**
   * 从服务端获取学习进度
   */
  async function getProgress(courseId) {
    if (!token) {
      return null;
    }
    
    try {
      const data = await apiRequest(`/progress?course_id=${courseId}`);
      return data;
    } catch (err) {
      console.error('Failed to get progress:', err);
      return null;
    }
  }
  
  /**
   * 从服务端获取答题记录
   */
  async function getAnswers(itemId) {
    if (!token) {
      return null;
    }
    
    try {
      const data = await apiRequest(`/answers?item_id=${itemId}`);
      return data.answers || [];
    } catch (err) {
      console.error('Failed to get answers:', err);
      return null;
    }
  }
  
  /**
   * 迁移 localStorage 数据到服务端
   */
  async function migrateFromLocalStorage() {
    if (!token) {
      console.warn('Not logged in, cannot migrate');
      return;
    }
    
    const answers = localStorage.getItem('courseware_answers');
    const progress = localStorage.getItem('courseware_progress');
    
    if (!answers && !progress) {
      console.log('No data to migrate');
      return;
    }
    
    try {
      const result = await apiRequest('/migrate', 'POST', {
        answers: answers ? JSON.parse(answers) : null,
        progress: progress ? JSON.parse(progress) : null
      });
      
      console.log('Migration result:', result);
      
      // 迁移成功后清除 localStorage
      if (result.success) {
        localStorage.removeItem('courseware_answers');
        localStorage.removeItem('courseware_progress');
        console.log('Local data cleared after successful migration');
      }
      
      return result;
    } catch (err) {
      console.error('Migration failed:', err);
      return null;
    }
  }
  
  return {
    setToken,
    clearToken,
    syncAnswers,
    syncProgress,
    getProgress,
    getAnswers,
    migrateFromLocalStorage
  };
})();
