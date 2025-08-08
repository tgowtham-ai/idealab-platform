import React, { useState, useEffect } from 'react';
import { Search, Plus, Heart, MessageCircle, Users, Star, TrendingUp, Bell, User, X, Check, Lightbulb, Target, Rocket, Award, Settings, Eye, Send, LogIn, LogOut, UserPlus } from 'lucide-react';

// Add this line at the top
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const App = () => {
  // Authentication State
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authLoading, setAuthLoading] = useState(false);

  // Application State
  const [activeTab, setActiveTab] = useState('discover');
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
  const [ideas, setIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhase, setFilterPhase] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize app - check for existing session
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check for existing authentication
      const token = localStorage.getItem('auth_token');
      if (token) {
        const userData = await authenticateUser(token);
        if (userData) {
          setUser(userData);
          await loadIdeas();
        }
      } else {
        // Load public ideas for non-authenticated users
        await loadPublicIdeas();
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      setError('Failed to initialize application');
    }
  };

  // Authentication API calls
  const authenticateUser = async (token) => {
    try {
      const response = await apiCall('/auth/verify', { 
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.user;
    } catch (error) {
      localStorage.removeItem('auth_token');
      return null;
    }
  };

  const login = async (email, password) => {
    try {
      setAuthLoading(true);
      const response = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      localStorage.setItem('auth_token', response.token);
      setUser(response.user);
      setShowAuthModal(false);
      await loadIdeas();
    } catch (error) {
      throw new Error(error.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (name, email, password, role = 'employee') => {
    try {
      setAuthLoading(true);
      const response = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role })
      });
      
      localStorage.setItem('auth_token', response.token);
      setUser(response.user);
      setShowAuthModal(false);
      await loadIdeas();
    } catch (error) {
      throw new Error(error.message || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setIdeas([]);
    setActiveTab('discover');
    loadPublicIdeas();
  };

  // API utility function
  const apiCall = async (endpoint, options = {}) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API call failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };

  // Ideas API calls
  const loadIdeas = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/ideas');
      setIdeas(response.ideas);
    } catch (error) {
      setError('Failed to load ideas');
    } finally {
      setLoading(false);
    }
  };

  const loadPublicIdeas = async () => {
    try {
      setLoading(true);
      const response = await apiCall('/ideas/public');
      setIdeas(response.ideas);
    } catch (error) {
      setError('Failed to load ideas');
    } finally {
      setLoading(false);
    }
  };

  const createIdea = async (ideaData) => {
    try {
      const response = await apiCall('/ideas', {
        method: 'POST',
        body: JSON.stringify(ideaData)
      });
      
      // Get AI analysis for the new idea
      const aiAnalysis = await getAIAnalysis(response.idea);
      const updatedIdea = { ...response.idea, aiAnalysis };
      
      setIdeas(prev => [updatedIdea, ...prev]);
      return updatedIdea;
    } catch (error) {
      throw new Error('Failed to create idea');
    }
  };

  const updateIdea = async (ideaId, updates) => {
    try {
      const response = await apiCall(`/ideas/${ideaId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      
      setIdeas(prev => prev.map(idea => 
        idea.id === ideaId ? response.idea : idea
      ));
      
      return response.idea;
    } catch (error) {
      throw new Error('Failed to update idea');
    }
  };

  const likeIdea = async (ideaId) => {
    try {
      await apiCall(`/ideas/${ideaId}/like`, { method: 'POST' });
      setIdeas(prev => prev.map(idea => 
        idea.id === ideaId 
          ? { ...idea, likes: idea.likes + 1, isLiked: true }
          : idea
      ));
    } catch (error) {
      console.error('Failed to like idea:', error);
    }
  };

  const requestCollaboration = async (ideaId, message) => {
    try {
      await apiCall(`/ideas/${ideaId}/collaborate`, {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      // Could show success notification here
    } catch (error) {
      throw new Error('Failed to request collaboration');
    }
  };

  // AI Integration
  const getAIAnalysis = async (idea) => {
    try {
      const prompt = `Analyze this business idea and provide insights:
      
      Title: ${idea.title}
      Description: ${idea.description}
      Tags: ${idea.tags?.join(', ')}
      
      Please provide:
      1. Similar existing solutions/competitors (max 5)
      2. Market opportunity assessment (1-10 score with brief explanation)
      3. Key recommendations (max 3)
      4. Potential risks or challenges (max 3)
      
      Respond with a JSON object in this exact format:
      {
        "similarSolutions": ["solution1", "solution2", "solution3"],
        "marketOpportunity": {
          "score": 8,
          "explanation": "Brief explanation of market potential"
        },
        "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
        "risks": ["risk1", "risk2", "risk3"]
      }
      
      DO NOT OUTPUT ANYTHING OTHER THAN VALID JSON.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error('AI analysis failed');
      }

      const data = await response.json();
      let responseText = data.content[0].text;
      
      // Clean up the response (remove markdown formatting if any)
      responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      const analysis = JSON.parse(responseText);
      return analysis;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      // Return fallback analysis if AI fails
      return {
        similarSolutions: ['Similar solution research needed'],
        marketOpportunity: { score: 5, explanation: 'Market analysis pending' },
        recommendations: ['Conduct user research', 'Validate assumptions', 'Build MVP'],
        risks: ['Market competition', 'Technical feasibility', 'User adoption']
      };
    }
  };

  const askAIAssistant = async (question, ideaContext) => {
    try {
      const prompt = `You are an AI business advisor helping with idea development.
      
      Idea Context:
      Title: ${ideaContext.title}
      Description: ${ideaContext.description}
      Current Phase: ${ideaContext.phase}
      
      User Question: ${question}
      
      Provide a helpful, actionable response in a conversational tone. Keep it concise but informative.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error('AI assistant failed');
      }

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('AI Assistant Error:', error);
      return "I'm having trouble processing your question right now. Please try again later or reach out to a mentor for assistance.";
    }
  };

  // Phase definitions
  const phases = [
    { name: 'Idea Spark', icon: Lightbulb, color: 'bg-yellow-500' },
    { name: 'Research & Validate', icon: Search, color: 'bg-blue-500' },
    { name: 'Plan & Strategy', icon: Target, color: 'bg-purple-500' },
    { name: 'Build & Test', icon: Settings, color: 'bg-green-500' },
    { name: 'Launch Ready', icon: Rocket, color: 'bg-red-500' }
  ];

  // Filter ideas based on search and phase
  const filteredIdeas = ideas.filter(idea => {
    const matchesSearch = idea.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         idea.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPhase = filterPhase === 'all' || idea.phase === filterPhase;
    return matchesSearch && matchesPhase;
  });

  // Authentication Modal Component
  const AuthModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      email: '',
      password: '',
      role: 'employee'
    });
    const [formError, setFormError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      setFormError('');
      
      try {
        if (authMode === 'login') {
          await login(formData.email, formData.password);
        } else {
          await register(formData.name, formData.email, formData.password, formData.role);
        }
      } catch (error) {
        setFormError(error.message);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-md w-full">
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">
              {authMode === 'login' ? 'Welcome Back! 👋' : 'Join IdeaLab! 🚀'}
            </h2>
            <button onClick={() => setShowAuthModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {formError}
              </div>
            )}
            
            {authMode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            
            {authMode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="employee">Employee</option>
                  <option value="mentor">Mentor</option>
                </select>
              </div>
            )}
            
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {authLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-purple-600 hover:text-purple-700 text-sm"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Idea Card Component
  const IdeaCard = ({ idea, onClick }) => {
    const phaseInfo = phases[idea.phaseIndex || 0];
    const IconComponent = phaseInfo.icon;
    
    return (
      <div 
        onClick={onClick}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all cursor-pointer hover:scale-105"
      >
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2 rounded-lg ${phaseInfo.color} bg-opacity-10`}>
            <IconComponent className={`w-5 h-5 ${phaseInfo.color.replace('bg-', 'text-')}`} />
          </div>
          <span className="text-xs text-gray-500">{idea.createdAt}</span>
        </div>
        
        <h3 className="font-semibold text-lg text-gray-900 mb-2">{idea.title}</h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-3">{idea.description}</p>
        
        <div className="flex flex-wrap gap-1 mb-4">
          {idea.tags?.map(tag => (
            <span key={tag} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (user) likeIdea(idea.id);
              }}
              className={`flex items-center space-x-1 hover:text-red-500 transition-colors ${
                idea.isLiked ? 'text-red-500' : ''
              }`}
            >
              <Heart className={`w-4 h-4 ${idea.isLiked ? 'fill-current' : ''}`} />
              <span>{idea.likes || 0}</span>
            </button>
            <div className="flex items-center space-x-1">
              <MessageCircle className="w-4 h-4" />
              <span>{idea.comments || 0}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>{idea.collaborators?.length || 0}</span>
            </div>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${phaseInfo.color} bg-opacity-20 text-gray-700`}>
            {idea.phase || 'Idea Spark'}
          </span>
        </div>
      </div>
    );
  };

  // New Idea Modal Component
  const NewIdeaModal = ({ onClose }) => {
    const [formData, setFormData] = useState({
      title: '',
      description: '',
      tags: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.title || !formData.description) return;
      
      setSubmitting(true);
      setError('');
      
      try {
        const ideaData = {
          title: formData.title,
          description: formData.description,
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
          phase: 'Idea Spark',
          phaseIndex: 0
        };
        
        await createIdea(ideaData);
        onClose();
      } catch (error) {
        setError(error.message);
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-2xl w-full">
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Share Your Idea 🚀</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Idea Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                placeholder="What's your game-changing idea?"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Tell us more about your idea and the problem it solves..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                rows={4}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({...formData, tags: e.target.value})}
                placeholder="AI, Productivity, Mobile (comma separated)"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Submit Idea'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // AI-Enhanced Idea Detail Modal Component
  const IdeaDetailModal = ({ idea, onClose }) => {
    const [activeSection, setActiveSection] = useState('overview');
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [collaborationMessage, setCollaborationMessage] = useState('');
    const [showCollaborationModal, setShowCollaborationModal] = useState(false);

    const phaseInfo = phases[idea.phaseIndex || 0];
    const IconComponent = phaseInfo.icon;

    const handleAskAI = async () => {
      if (!aiQuestion.trim()) return;
      
      setAiLoading(true);
      try {
        const response = await askAIAssistant(aiQuestion, idea);
        setAiResponse(response);
        setAiQuestion('');
      } catch (error) {
        setAiResponse('Sorry, I encountered an error. Please try again.');
      } finally {
        setAiLoading(false);
      }
    };

    const handleRequestCollaboration = async () => {
      try {
        await requestCollaboration(idea.id, collaborationMessage);
        setShowCollaborationModal(false);
        setCollaborationMessage('');
        // Could show success notification
      } catch (error) {
        console.error('Collaboration request failed:', error);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${phaseInfo.color} bg-opacity-10`}>
                <IconComponent className={`w-5 h-5 ${phaseInfo.color.replace('bg-', 'text-')}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{idea.title}</h2>
                <p className="text-sm text-gray-500">by {idea.author} • {idea.createdAt}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex border-b">
            {['overview', 'ai-insights', 'collaborate'].map(section => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeSection === section 
                    ? 'border-purple-500 text-purple-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {section === 'overview' && 'Overview'}
                {section === 'ai-insights' && '🤖 AI Insights'}
                {section === 'collaborate' && 'Collaborate'}
              </button>
            ))}
          </div>
          
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {activeSection === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-600">{idea.description}</p>
                </div>
                
                {idea.tags && idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {idea.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Heart className="w-5 h-5" />
                    <span>{idea.likes || 0} likes</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <MessageCircle className="w-5 h-5" />
                    <span>{idea.comments || 0} comments</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Users className="w-5 h-5" />
                    <span>{idea.collaborators?.length || 0} collaborators</span>
                  </div>
                </div>
              </div>
            )}
            
            {activeSection === 'ai-insights' && (
              <div className="space-y-6">
                <h3 className="font-semibold text-gray-900">AI Analysis & Insights</h3>
                
                {idea.aiAnalysis ? (
                  <>
                    {/* Similar Solutions */}
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-900 mb-3">Similar Solutions & Competitors</h4>
                      <div className="space-y-2">
                        {idea.aiAnalysis.similarSolutions?.map((solution, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-white rounded">
                            <span className="text-gray-900">{solution}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Market Opportunity */}
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-900 mb-3">📊 Market Opportunity</h4>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-2xl font-bold text-green-800">
                          {idea.aiAnalysis.marketOpportunity?.score || 'N/A'}/10
                        </span>
                        <span className="text-green-700">Opportunity Score</span>
                      </div>
                      <p className="text-sm text-green-800">
                        {idea.aiAnalysis.marketOpportunity?.explanation}
                      </p>
                    </div>
                    
                    {/* Recommendations */}
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-3">💡 Recommendations</h4>
                      <div className="space-y-1 text-sm text-blue-800">
                        {idea.aiAnalysis.recommendations?.map((rec, index) => (
                          <p key={index}>• {rec}</p>
                        ))}
                      </div>
                    </div>
                    
                    {/* Risks */}
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-medium text-yellow-900 mb-3">⚠️ Risks & Challenges</h4>
                      <div className="space-y-1 text-sm text-yellow-800">
                        {idea.aiAnalysis.risks?.map((risk, index) => (
                          <p key={index}>• {risk}</p>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Generating AI insights...</p>
                  </div>
                )}
                
                {/* Ask AI Assistant */}
                <div className="border-2 border-dashed border-gray-300 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Ask AI Assistant</h4>
                  <div className="flex space-x-2 mb-3">
                    <input
                      type="text"
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      placeholder="Ask anything about this idea..."
                      className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      onKeyPress={(e) => e.key === 'Enter' && handleAskAI()}
                    />
                    <button 
                      onClick={handleAskAI}
                      disabled={aiLoading || !aiQuestion.trim()}
                      className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {aiLoading ? '...' : 'Ask'}
                    </button>
                  </div>
                  {aiResponse && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-700">{aiResponse}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeSection === 'collaborate' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Collaboration</h3>
                
                {idea.collaborators && idea.collaborators.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Current Collaborators</h4>
                    <div className="space-y-2">
                      {idea.collaborators.map(collaborator => (
                        <div key={collaborator} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm">
                            {collaborator[0]}
                          </div>
                          <span className="text-gray-900">{collaborator}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {user && idea.authorId !== user.id && !idea.collaborators?.includes(user.name) && (
                  <button 
                    onClick={() => setShowCollaborationModal(true)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700"
                  >
                    Request to Collaborate
                  </button>
                )}
                
                {!user && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-blue-800">
                      <button 
                        onClick={() => setShowAuthModal(true)}
                        className="text-blue-600 hover:text-blue-700 underline"
                      >
                        Sign in
                      </button> to collaborate on this idea!
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Collaboration Request Modal */}
        {showCollaborationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-60">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Collaboration</h3>
              <textarea
                value={collaborationMessage}
                onChange={(e) => setCollaborationMessage(e.target.value)}
                placeholder="Tell the idea owner why you'd like to collaborate..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 mb-4"
                rows={4}
              />
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowCollaborationModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestCollaboration}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Main App Render
  if (loading && ideas.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading IdeaLab...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  IdeaLab
                </h1>
              </div>
            </div>
            
            <nav className="hidden md:flex space-x-8">
              <button 
                onClick={() => setActiveTab('discover')}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'discover' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Discover Ideas
              </button>
              {user && (
                <>
                  <button 
                    onClick={() => setActiveTab('my-ideas')}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'my-ideas' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    My Ideas
                  </button>
                  <button 
                    onClick={() => setActiveTab('collaborate')}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'collaborate' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Collaborations
                  </button>
                  {user.role === 'admin' && (
                    <button 
                      onClick={() => setActiveTab('admin')}
                      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === 'admin' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Admin Dashboard
                    </button>
                  )}
                </>
              )}
            </nav>

            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <button className="p-2 text-gray-400 hover:text-gray-500">
                    <Bell className="w-5 h-5" />
                  </button>
                  <div className="flex items-center space-x-2 text-sm">
                    <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm">
                      {user.name[0]}
                    </div>
                    <span className="hidden md:block font-medium text-gray-700">{user.name}</span>
                  </div>
                  <button 
                    onClick={logout}
                    className="p-2 text-gray-400 hover:text-gray-500"
                    title="Sign out"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center space-x-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Discover Tab */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            {/* Hero Section */}
            <div className="text-center py-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Got a game-changing idea? 🚀
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Share your vision, find collaborators, and turn ideas into reality
              </p>
              {user ? (
                <button 
                  onClick={() => setShowNewIdeaModal(true)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 flex items-center space-x-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>Drop Your Idea</span>
                </button>
              ) : (
                <button 
                  onClick={() => setShowAuthModal(true)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-3 rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 flex items-center space-x-2 mx-auto"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>Join to Share Ideas</span>
                </button>
              )}
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search ideas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <select
                value={filterPhase}
                onChange={(e) => setFilterPhase(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Phases</option>
                {phases.map(phase => (
                  <option key={phase.name} value={phase.name}>{phase.name}</option>
                ))}
              </select>
            </div>

            {/* Ideas Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredIdeas.map(idea => (
                <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
              ))}
            </div>
            
            {filteredIdeas.length === 0 && (
              <div className="text-center py-12">
                <Lightbulb className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas found</h3>
                <p className="text-gray-500">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        )}

        {/* My Ideas Tab */}
        {activeTab === 'my-ideas' && user && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Your Ideas 💡</h2>
              <button 
                onClick={() => setShowNewIdeaModal(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Idea</span>
              </button>
            </div>
            
            {ideas.filter(idea => idea.authorId === user.id).length === 0 ? (
              <div className="text-center py-12">
                <Lightbulb className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas yet</h3>
                <p className="text-gray-500 mb-6">Ready to change the world? Share your first idea!</p>
                <button 
                  onClick={() => setShowNewIdeaModal(true)}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  Submit Your First Idea
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ideas.filter(idea => idea.authorId === user.id).map(idea => (
                  <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collaborations Tab */}
        {activeTab === 'collaborate' && user && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Collaborations 🤝</h2>
            
            {ideas.filter(idea => idea.collaborators?.includes(user.name)).length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No collaborations yet</h3>
                <p className="text-gray-500">Explore ideas and request to collaborate with others!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ideas.filter(idea => idea.collaborators?.includes(user.name)).map(idea => (
                  <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin Dashboard */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard 📊</h2>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Ideas</p>
                    <p className="text-2xl font-bold text-gray-900">{ideas.length}</p>
                  </div>
                  <Lightbulb className="w-8 h-8 text-yellow-500" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Ideas</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {ideas.filter(idea => (idea.phaseIndex || 0) > 0).length}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-500" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Likes</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {ideas.reduce((sum, idea) => sum + (idea.likes || 0), 0)}
                    </p>
                  </div>
                  <Heart className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Collaborations</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {ideas.reduce((sum, idea) => sum + (idea.collaborators?.length || 0), 0)}
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-purple-500" />
                </div>
              </div>
            </div>
            
            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Overview</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total Platform Engagement</span>
                  <span className="font-medium text-gray-900">
                    {ideas.reduce((sum, idea) => sum + (idea.likes || 0) + (idea.comments || 0), 0)} interactions
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Average Ideas per User</span>
                  <span className="font-medium text-gray-900">2.3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Most Popular Phase</span>
                  <span className="font-medium text-gray-900">Research & Validate</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAuthModal && <AuthModal />}
      {selectedIdea && <IdeaDetailModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} />}
      {showNewIdeaModal && user && <NewIdeaModal onClose={() => setShowNewIdeaModal(false)} />}
    </div>
  );
};

export default App;