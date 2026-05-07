import { createLogger } from '../lib/logger.js';

const log = createLogger('daily-reporter');

export class DailyReporter {
  constructor(settingsRepo, campaignsRepo, platformAccountsRepo) {
    this.settingsRepo = settingsRepo;
    this.campaignsRepo = campaignsRepo;
    this.platformAccountsRepo = platformAccountsRepo;
  }

  // Send daily report to user
  async sendDailyReport(userId) {
    // Get all campaigns for user
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    
    // Calculate statistics
    const stats = this._calculateStats(campaigns);
    
    // Generate report
    const report = this._generateReport(userId, stats);
    
    // Send via user's preferred channel (Telegram, email, etc.)
    await this._sendReport(userId, report);
    
    // Log for audit
    log.info('Daily report sent', {
      userId: userId,
      campaigns: stats.totalCampaigns,
      active: stats.activeCampaigns,
      totalSpend: stats.totalSpend,
      totalROAS: stats.totalROAS
    });
    
    return report;
  }

  // Send reports at scheduled time (configure via user settings)
  async sendScheduledReport(userId) {
    // Check if user has enabled daily reports
    const settings = this.settingsRepo.get(`daily_report:${userId}`) || 'enabled';
    if (settings === 'disabled') {
      log.info('Daily report skipped - user disabled', { userId });
      return null;
    }

    return await this.sendDailyReport(userId);
  }

  // Calculate campaign statistics
  _calculateStats(campaigns) {
    if (!campaigns || campaigns.length === 0) {
      return {
        totalCampaigns: 0,
        activeCampaigns: 0,
        pausedCampaigns: 0,
        totalSpend: 0,
        totalROAS: 0,
        avgROAS: 0,
        campaigns: []
      };
    }

    let totalSpend = 0;
    let totalROAS = 0;
    let activeCount = 0;

    const campaignStats = campaigns.map(c => {
      const stats = c.stats || {};
      const spend = stats.spend || 0;
      const roas = stats.roas || 0;
      
      totalSpend += spend;
      totalROAS += roas;
      if (c.status === 'ACTIVE' || stats.status === 'active') activeCount++;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        spend: spend,
        roas: roas,
        cpc: stats.cpc || 0,
        cpm: stats.cpm || 0,
        impressions: stats.impressions || 0,
        clicks: stats.clicks || 0
      };
    });

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCount,
      pausedCampaigns: campaigns.length - activeCount,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalROAS: totalROAS,
      avgROAS: campaigns.length > 0 ? Math.round((totalROAS / campaigns.length) * 100) / 100 : 0,
      campaigns: campaignStats
    };
  }

  // Generate formatted report
  _generateReport(userId, stats) {
    const date = new Date().toLocaleDateString('en-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Determine campaign health
    let healthStatus = 'healthy';
    if (stats.activeCampaigns === 0) healthStatus = 'warning';
    if (stats.avgROAS > 0 && stats.avgROAS < 1) healthStatus = 'critical';

    return {
      userId: userId,
      date: date,
      summary: {
        totalCampaigns: stats.totalCampaigns,
        activeCampaigns: stats.activeCampaigns,
        averageROAS: stats.avgROAS,
        totalSpend: stats.totalSpend,
        healthStatus: healthStatus
      },
      campaigns: stats.campaigns.slice(0, 10), // Top 10 campaigns
      recommendations: this._generateRecommendations(stats)
    };
  }

  // Generate recommendations based on stats
  _generateRecommendations(stats) {
    const recommendations = [];

    if (stats.totalCampaigns === 0) {
      recommendations.push({
        type: 'warning',
        message: 'No campaigns running. Consider creating new campaigns.'
      });
    } else if (stats.pausedCampaigns > stats.activeCampaigns) {
      recommendations.push({
        type: 'warning',
        message: `More campaigns paused (${stats.pausedCampaigns}) than active (${stats.activeCampaigns}). Consider reviewing your budget allocation.`
      });
    }

    if (stats.avgROAS > 0 && stats.avgROAS < 2) {
      recommendations.push({
        type: 'optimization',
        message: `Average ROAS is ${stats.avgROAS}. Consider optimizing campaigns with ROAS below 2.0`
      });
    }

    if (stats.campaigns.length > 0) {
      // Find top performer
      const top = stats.campaigns.sort((a, b) => b.roas - a.roas)[0];
      if (top && top.roas > 3) {
        recommendations.push({
          type: 'success',
          message: `Top performer: ${top.name} with ROAS of ${top.roas}. Consider scaling this campaign!`
        });
      }
    }

    return recommendations;
  }

  // Send report via user's preferred channel
  async _sendReport(userId, report) {
    // For now, log the report
    // In production, integrate with:
    // - Telegram bot
    // - Email (Nodemailer)
    // - Slack webhook
    // - WhatsApp Cloud API
    
    log.info('Report ready to send', { userId, date: report.date });
    
    // Example: Send to Telegram
    // await telegram.sendReport(userId, report);
    
    // Example: Schedule via cron
    // await cron.schedule('0 9 * * *', () => this.sendScheduledReport(userId));
    
    return true;
  }

  // Start scheduled daily reports
  startDailyScheduler() {
    // Run at 9 AM daily (Jakarta time)
    // This would integrate with cron or setTimeout
    log.info('Daily reporter started');
    
    // Example: Every day at 9 AM
    // const cron = require('node-cron');
    // cron.schedule('0 9 * * *', () => this.sendDailyReportsToAllUsers());
    
    return () => {
      // Stop function
      log.info('Daily reporter stopped');
    };
  }

  // Send reports to all users with enabled auto-mode
  async sendDailyReportsToAllUsers() {
    // Get all users with active Meta accounts
    const users = await this.platformAccountsRepo.getUsersWithMetaAccounts();
    
    for (const user of users) {
      try {
        await this.sendDailyReport(user.id);
      } catch (err) {
        log.error('Failed to send report', { userId: user.id, error: err.message });
      }
    }
  }
}
