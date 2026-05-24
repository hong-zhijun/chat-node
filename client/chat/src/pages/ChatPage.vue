<template>
  <div class="chat-shell">
    <!-- ═══ Sidebar ═══ -->
    <aside class="sidebar" :class="{ open: drawerOpen }">
      <!-- Brand -->
      <div class="sb-brand">
        <span class="brand-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="var(--accent)"/>
            <line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="8" cy="8" r="2.4" fill="white"/>
            <circle cx="16" cy="16" r="2.4" fill="white"/>
            <circle cx="17" cy="7" r="1.4" fill="white" opacity="0.7"/>
          </svg>
        </span>
        <span class="brand-name">nodex</span>
      </div>

      <!-- Peer selector + Actions -->
      <div class="sb-top">
        <!-- Peer selector dropdown -->
        <div class="peer-select-wrap" ref="peerSelectRef">
          <button
            class="peer-select"
            :class="{ open: peerMenuOpen }"
            @click="peerMenuOpen = !peerMenuOpen"
          >
            <div class="info">
              <span class="lbl">Chat ID</span>
              <span class="val">{{ currentPeer?.userId || 'Select…' }}</span>
            </div>
            <span class="chevron">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </span>
          </button>

          <div v-if="peerMenuOpen" class="peer-menu">
            <div
              v-for="c in chatStore.conversations"
              :key="c.peer.userId"
              class="peer-menu-item"
              :class="{ active: c.peer.userId === chatStore.activePeerId }"
              @click="selectConv(c.peer.userId); peerMenuOpen = false"
            >
              <span style="font-family:ui-monospace,monospace;font-size:13px;color:var(--text)">{{ c.peer.userId }}</span>
              <span style="flex:1;min-width:0;font-size:12px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:4px">{{ c.peer.name }}</span>
              <span v-if="c.unread > 0" style="font-size:11px;color:var(--accent);font-weight:600;flex-shrink:0">{{ c.unread }}</span>
            </div>
            <div v-if="!chatStore.conversations.length" style="padding:12px 10px;font-size:13px;color:var(--text-3);text-align:center">
              No conversations yet
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <button class="sb-action" @click="openNewChat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New chat
        </button>
        <button class="sb-action" @click="showFiles = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/>
          </svg>
          Shared files
        </button>
      </div>

      <!-- Thread / conversation list（伪装数据）-->
      <div class="sb-list">
        <template v-for="group in FAKE_CONVS" :key="group.group">
          <div class="sb-section-label">{{ group.group }}</div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="thread-item"
            :class="{ active: item.id === displayTitlePeerId }"
            @click="selectDisplayTitle(item.id, item.title)"
          >
            <span class="title">{{ item.title }}</span>
          </div>
        </template>
      </div>

      <hr class="sep" />

      <!-- User info -->
      <div class="sb-bottom">
        <div class="user-row">
          <AppAvatar :name="auth.user?.name" :id="auth.user?.userId" :size="28" />
          <div class="user-info">
            <div class="user-name">{{ auth.user?.name || '—' }}</div>
            <div class="user-id">
              ID · {{ auth.user?.userId }}
              <button class="icon-btn" style="width:20px;height:20px" title="Copy ID" @click="copyId">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
                </svg>
              </button>
            </div>
          </div>
          <button class="icon-btn" style="width:28px;height:28px;flex-shrink:0;margin-left:2px" title="设置" @click="openSettings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile scrim -->
    <div class="scrim" :class="{ show: drawerOpen }" @click="drawerOpen = false"></div>

    <!-- ═══ Main panel ═══ -->
    <main class="main">
      <!-- Topbar -->
      <header class="topbar">
        <button class="icon-btn hamburger" @click="drawerOpen = true" title="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18"/>
          </svg>
        </button>
        <div class="left">
          <span v-if="currentPeer" class="thread-title">{{ displayTitle || currentPeer.name }}</span>
        </div>
        <div class="right">
          <!-- Connection indicator -->
          <div class="conn" :class="wsStore.state">
            <span
              v-if="wsStore.state === 'connecting' || wsStore.state === 'reconnecting'"
              class="pulse-dot"
              style="color:var(--warn);background:var(--warn)"
            ></span>
            <span v-else class="conn-dot"></span>
            <span>{{ wsStore.connLabel() }}</span>
            <button
              v-if="wsStore.state === 'disconnected'"
              class="btn btn-ghost"
              style="height:22px;padding:0 8px;font-size:12px;color:var(--accent)"
              @click="wsStore.connect(auth.token)"
            >Reconnect</button>
          </div>
          <!-- Toggle theme -->
          <button class="icon-btn" title="切换主题" @click="toggleTheme">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          </button>
          <!-- Sleep mode -->
          <button class="btn btn-ghost sleep-btn" @click="enterSleep">睡眠模式</button>
          <!-- Logout -->
          <button class="icon-btn" title="退出登录" @click="logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Message area -->
      <div v-if="chatStore.activePeerId" class="msg-area" ref="scrollEl" @scroll.passive="onScroll">
        <div class="msg-track">
          <!-- Load earlier -->
          <div v-if="hasMore" class="load-earlier">
            <span class="spinner"></span> Loading earlier messages…
          </div>

          <!-- Messages -->
          <template v-for="(m, i) in currentMessages" :key="m.id || m.tempId">
            <!-- Recalled -->
            <div v-if="m.recalled" class="recalled">This message was recalled</div>

            <!-- Normal message row -->
            <div
              v-else
              class="msg-row"
              :class="{
                self: isSelf(m),
                compact: isCompact(m, i),
                'msg-enter': !!m.tempId
              }"
            >
              <!-- Nodex logo (左侧) -->
              <div v-if="!isSelf(m)" class="msg-avatar" :style="isCompact(m,i) ? 'visibility:hidden' : ''">
                <div class="nodex-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect width="24" height="24" rx="6" fill="var(--accent)"/>
                    <line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="2.4" fill="white"/>
                    <circle cx="16" cy="16" r="2.4" fill="white"/>
                    <circle cx="17" cy="7" r="1.4" fill="white" opacity="0.7"/>
                  </svg>
                </div>
              </div>

              <!-- Peer message -->
              <div v-if="!isSelf(m)" class="peer-msg-wrap">
                <div v-if="!isCompact(m, i)" class="peer-name-label">nodex</div>
                <MsgBody
                  :m="m"
                  @view-image="viewerSrc = $event"
                  @ctx-menu="onCtx($event, m)"
                  @touch-start="onTouchStart($event, m)"
                  @touch-end="onTouchEnd"
                />
                <template v-if="msgFiller(m)">
                  <div class="filler-sep"></div>
                  <div class="filler-body">{{ msgFiller(m) }}</div>
                </template>
                <div class="msg-meta">
                  <span
                    class="msg-time"
                    @click="toggleTime(m.id || m.tempId)"
                    style="cursor:pointer"
                  >{{ expandedTimeId === (m.id || m.tempId) ? fmtDatetime(m.createdAt) : fmtTime(m.createdAt) }}</span>
                </div>
              </div>

              <!-- Self message -->
              <div v-else class="bubble-self-wrap">
                <div class="bubble-wrap">
                  <MsgBody
                    :m="m"
                    @view-image="viewerSrc = $event"
                    @ctx-menu="onCtx($event, m)"
                    @touch-start="onTouchStart($event, m)"
                    @touch-end="onTouchEnd"
                  />
                  <div class="msg-meta">
                    <span
                      class="msg-state"
                      :class="{ failed: m.state === 'failed' }"
                      @click="m.state === 'failed' && retrySend(m)"
                    >{{ fmtMsgState(m.state) }}</span>
                    <span
                      class="msg-time"
                      @click="toggleTime(m.id || m.tempId)"
                      style="cursor:pointer"
                    >{{ expandedTimeId === (m.id || m.tempId) ? fmtDatetime(m.createdAt) : fmtTime(m.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="chat-empty">
        <div class="glyph">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h2>Nodex</h2>
        <p>Pick a conversation from the sidebar or start a new one.</p>
        <button class="btn btn-primary" @click="openNewChat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          New chat
        </button>
      </div>

      <!-- Input composer -->
      <div v-if="chatStore.activePeerId" class="input-wrap">
        <!-- 引用预览条 -->
        <div v-if="replyingTo" class="reply-preview-bar">
          <div class="rp-text">
            <span class="rp-from">引用 {{ replyFromName }}：</span>
            <span class="rp-preview">{{ replyingTo.preview }}</span>
          </div>
          <button class="rp-close" @click="cancelReply" title="取消引用">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <!-- 表情选择器 -->
        <div v-if="showEmojiPicker" ref="emojiWrapRef" class="emoji-picker-mount">
          <EmojiPicker @pick="insertEmoji" />
        </div>
        <div class="input-inner">
          <button class="attach-btn" @click="fileInputRef?.click()" title="Attach file">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12L12.5 20.5a5 5 0 0 1-7-7L13 6a3.5 3.5 0 0 1 5 5L9.5 19.5"/>
            </svg>
          </button>
          <!-- 表情按钮 -->
          <button class="attach-btn" @click.stop="showEmojiPicker = !showEmojiPicker" title="Emoji">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
          <textarea
            ref="taRef"
            class="input-textarea"
            rows="1"
            placeholder="Message"
            v-model="draft"
            @keydown="onKeyDown"
            @input="autosize"
            @paste="onPaste"
          ></textarea>
          <button
            class="send-btn"
            :disabled="!draft.trim()"
            @click="send"
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
        <div class="input-hint">Enter to send · Shift+Enter for new line</div>
        <input ref="fileInputRef" type="file" style="display:none" @change="onFileSelect" />
      </div>
    </main>

    <!-- ═══ New chat modal ═══ -->
    <div v-if="showNewChat" class="modal-overlay" @click.self="closeNewChat">
      <div class="modal">
        <h3>New chat</h3>
        <p>Enter the user ID of the person you want to chat with.</p>
        <input
          class="input"
          v-model="newChatId"
          placeholder="User ID (e.g. 481-202)"
          @keydown.enter="startNewChat"
          ref="newChatInputRef"
        />
        <div v-if="newChatError" style="font-size:12px;color:var(--danger);margin-top:6px">{{ newChatError }}</div>
        <div class="actions">
          <button class="btn btn-ghost" @click="closeNewChat">Cancel</button>
          <button class="btn btn-primary" :disabled="!newChatId.trim() || newChatLoading" @click="startNewChat">
            <span v-if="newChatLoading" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>Start chat</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Image viewer ═══ -->
    <div
      v-if="viewerSrc"
      class="modal-overlay"
      style="background:rgba(0,0,0,0.85);z-index:100"
      @click="viewerSrc = null"
    >
      <img
        :src="viewerSrc"
        style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain;cursor:zoom-out"
        @click.stop
      />
    </div>

    <!-- ═══ 撤回二次确认 ═══ -->
    <div v-if="recallConfirmId" class="modal-overlay" @click.self="recallConfirmId = null">
      <div class="modal">
        <h3>撤回消息</h3>
        <p>消息撤回后双方均无法看到，确认撤回？</p>
        <div class="actions">
          <button class="btn btn-ghost" @click="recallConfirmId = null">取消</button>
          <button class="btn btn-danger" @click="confirmRecall">确认撤回</button>
        </div>
      </div>
    </div>

    <!-- ═══ Settings modal ═══ -->
    <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
      <div class="modal">
        <h3>通知设置</h3>
        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-label">标签页闪烁</div>
            <div class="setting-desc">有新消息时标签页标题交替闪烁</div>
          </div>
          <button
            class="toggle-btn"
            :class="{ 'toggle-on': settingsBlink }"
            @click="settingsBlink = !settingsBlink"
            :aria-checked="settingsBlink"
            role="switch"
          ></button>
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-label">未读消息数</div>
            <div class="setting-desc">在标签页标题显示未读消息数量</div>
          </div>
          <button
            class="toggle-btn"
            :class="{ 'toggle-on': settingsUnread }"
            @click="settingsUnread = !settingsUnread"
            :aria-checked="settingsUnread"
            role="switch"
          ></button>
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-label">显示 AI 文案</div>
            <div class="setting-desc">在对方消息下方附加伪装文案</div>
          </div>
          <button
            class="toggle-btn"
            :class="{ 'toggle-on': settingsShowFiller }"
            @click="settingsShowFiller = !settingsShowFiller"
            :aria-checked="settingsShowFiller"
            role="switch"
          ></button>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" @click="showSettings = false">取消</button>
          <button class="btn btn-primary" :disabled="settingsSaving" @click="saveSettings">
            <span v-if="settingsSaving" class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span v-else>保存</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Sleep overlay ═══ -->
    <div v-if="sleepMode" class="sleep-overlay" @click="exitSleep">
      <div class="sleep-card">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(255,255,255,0.6);margin-bottom:16px">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <p class="sleep-title">睡眠模式已开启</p>
        <p class="sleep-hint">点击任意位置退出</p>
      </div>
    </div>

    <!-- ═══ Files modal ═══ -->
    <FilesModal v-if="showFiles" @close="showFiles = false" />

    <!-- ═══ Message context menu (右键/长按) ═══ -->
    <div
      v-if="ctxMenu"
      class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <button v-if="ctxMenu.canCopy" class="ctx-menu-item" @click="ctxDoCopy">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2"/>
          <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
        </svg>
        <span>复制</span>
      </button>
      <button v-if="ctxMenu.canReply" class="ctx-menu-item" @click="ctxDoReply">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 17 4 12 9 7"/>
          <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
        </svg>
        <span>引用</span>
      </button>
      <button v-if="ctxMenu.canRecall" class="ctx-menu-item danger" @click="ctxDoRecall">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
        </svg>
        <span>撤回</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'

// ── 侧边栏伪装数据（模拟与 AI 的灯泡相关对话历史）──────────────────────
const FAKE_CONVS = [
  { group: '今天', items: [
    { id: 'f1', title: 'LED量子点发光效率优化方案' },
    { id: 'f2', title: '蓝光抑制褪黑素的机制分析' },
  ]},
  { group: '昨天', items: [
    { id: 'f3', title: '智能灯泡Matter协议接入问题排查' },
    { id: 'f4', title: '哈兹定律与未来LED性能预测' },
  ]},
  { group: '最近7天', items: [
    { id: 'f5', title: '高功率LED阵列散热方案设计' },
    { id: 'f6', title: 'UV-C紫外灯265nm消毒效率计算' },
    { id: 'f7', title: 'LIFX固件升级与HomeKit兼容性' },
    { id: 'f8', title: '灯泡色温对工作效率的影响研究' },
  ]},
  { group: '更早以前', items: [
    { id: 'f9',  title: 'IEC 62612灯具能效标准解读' },
    { id: 'f10', title: '钙钛矿量子点LED毒性替代方案' },
    { id: 'f11', title: '爱迪生灯泡专利与发明历史' },
    { id: 'f12', title: '节能灯与白炽灯光谱对比分析' },
    { id: 'f13', title: '光照强度单位换算：lux lm cd' },
  ]},
]
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useChatStore } from '@/stores/chat.js'
import { useWsStore } from '@/stores/ws.js'
import { api, fmtTime, fmtDatetime } from '@/api/index.js'
import AppAvatar from '@/components/AppAvatar.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import MsgBody from './MsgBody.vue'
import FilesModal from './FilesModal.vue'

const router = useRouter()
const auth = useAuthStore()
const chatStore = useChatStore()
const wsStore = useWsStore()

// ── UI state ──────────────────────────────────────────────────────────
const fillers      = ref([])
const drawerOpen   = ref(false)
const peerMenuOpen = ref(false)
// 侧边栏"伪装"标题：点击左侧列表仅改变顶栏显示名，不切换实际会话
const displayTitle     = ref('')
const displayTitlePeerId = ref('')
const peerSelectRef = ref(null)
const showNewChat  = ref(false)
const showFiles    = ref(false)
const showSettings = ref(false)
const settingsBlink  = ref(true)
const settingsUnread = ref(true)
const settingsShowFiller = ref(true)
const settingsSaving = ref(false)
const recallConfirmId = ref(null)  // 等待二次确认的消息 id
const showEmojiPicker = ref(false)
const emojiWrapRef    = ref(null)
const draft        = ref('')
const viewerSrc    = ref(null)
const scrollEl     = ref(null)
const taRef        = ref(null)
const fileInputRef = ref(null)
const newChatInputRef = ref(null)
const hasMore         = ref(false)
const sleepMode       = ref(false)
let sleepTimer        = null
const expandedTimeId  = ref(null)
const replyingTo      = ref(null)  // { id, fromUserId, type, preview, recalled }
const ctxMenu         = ref(null)  // { msg, x, y, canCopy, canReply, canRecall }
const RECALL_WINDOW_MS = 2 * 60 * 1000
let longPressTimer    = null

function toggleTime(id) {
  expandedTimeId.value = expandedTimeId.value === id ? null : id
}

function startReply(m) {
  if (!m || !m.id || m.recalled) return
  let preview = ''
  if (m.type === 'text') {
    const raw = typeof m.content === 'string' ? m.content : (m.content?.text || '')
    preview = raw.slice(0, 80)
  } else if (m.type === 'image') {
    preview = '[图片]'
  } else if (m.type === 'file') {
    const c = typeof m.content === 'string' ? {} : (m.content || {})
    preview = c.filename ? `[文件] ${c.filename}` : '[文件]'
  }
  replyingTo.value = {
    id: m.id,
    fromUserId: m.fromUserId,
    type: m.type,
    preview,
    recalled: false
  }
  nextTick(() => taRef.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

// ── 右键 / 长按 消息菜单 ─────────────────────────────────────────
function showCtxMenuAt(m, x, y) {
  if (!m || !m.id || m.recalled) return
  const isSelfMsg = m.fromUserId === chatStore.selfUserId()
  const inRecallWindow = Date.now() - (m.createdAt || 0) < RECALL_WINDOW_MS
  const W = 160, H = 140
  if (x + W > window.innerWidth) x = Math.max(8, window.innerWidth - W - 8)
  if (y + H > window.innerHeight) y = Math.max(8, window.innerHeight - H - 8)
  ctxMenu.value = {
    msg: m,
    x, y,
    canCopy: m.type === 'text',
    canReply: true,
    canRecall: isSelfMsg && inRecallWindow
  }
}

function onCtx(e, m) {
  showCtxMenuAt(m, e.clientX, e.clientY)
}

function onTouchStart(e, m) {
  if (longPressTimer) clearTimeout(longPressTimer)
  const t = e.touches?.[0]
  if (!t) return
  const x = t.clientX, y = t.clientY
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    showCtxMenuAt(m, x, y)
  }, 500)
}

function onTouchEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

function closeCtxMenu() {
  ctxMenu.value = null
}

function ctxDoCopy() {
  const m = ctxMenu.value?.msg
  closeCtxMenu()
  if (!m) return
  const text = typeof m.content === 'string' ? m.content : (m.content?.text || '')
  if (text) navigator.clipboard?.writeText(text).catch(() => {})
}

function ctxDoReply() {
  const m = ctxMenu.value?.msg
  closeCtxMenu()
  if (m) startReply(m)
}

function ctxDoRecall() {
  const m = ctxMenu.value?.msg
  closeCtxMenu()
  if (m?.id) recallConfirmId.value = m.id
}

const replyFromName = computed(() => {
  if (!replyingTo.value) return ''
  if (replyingTo.value.fromUserId === chatStore.selfUserId()) return '我'
  return currentPeer.value?.name || 'nodex'
})
const newChatId    = ref('')
const newChatError = ref('')
const newChatLoading = ref(false)

// ── Computed ──────────────────────────────────────────────────────────
const currentPeer = computed(() => {
  if (!chatStore.activePeerId) return null
  const conv = chatStore.conversations.find(c => c.peer.userId === chatStore.activePeerId)
  return conv?.peer || null
})

const currentMessages = computed(() =>
  chatStore.messages[chatStore.activePeerId] || []
)


// Group conversations by recency (Today / Yesterday / Previous 7 days / Previous 30 days / Older)
const groupedConvs = computed(() => {
  const now = new Date()
  const todayStr = now.toDateString()
  const yestStr  = new Date(now - 86400000).toDateString()
  const wkMs     = 7  * 86400000
  const moMs     = 30 * 86400000

  const groups = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'Previous 30 days': [],
    Older: []
  }

  for (const c of chatStore.conversations) {
    const d  = new Date(c.lastMessageAt || 0)
    const ds = d.toDateString()
    const age = now - d
    if      (ds === todayStr)  groups['Today'].push(c)
    else if (ds === yestStr)   groups['Yesterday'].push(c)
    else if (age <= wkMs)      groups['Previous 7 days'].push(c)
    else if (age <= moMs)      groups['Previous 30 days'].push(c)
    else                       groups['Older'].push(c)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([name, items]) => ({ name, items }))
})

// ── Message helpers ───────────────────────────────────────────────────
function isSelf(m) { return m.fromUserId === chatStore.selfUserId() }

// 确定性取 filler：同一条消息每次刷新显示同一段文字
function msgFiller(m) {
  if (auth.user?.showFiller === 0) return null
  if (!fillers.value.length || !m.id || isSelf(m)) return null
  return fillers.value[m.id % fillers.value.length]?.content ?? null
}
function isCompact(m, i) {
  const prev = currentMessages.value[i - 1]
  return !!(prev && prev.fromUserId === m.fromUserId && !prev.recalled && !m.recalled)
}
function fmtMsgState(state) {
  return { sending: '发送中…', sent: '已发送', read: '已读', failed: '发送失败，点击重试' }[state] || null
}

// ── Navigation ────────────────────────────────────────────────────────
async function selectConv(peerId) {
  drawerOpen.value = false
  peerMenuOpen.value = false
  // 切换真实会话时清除伪装标题
  displayTitle.value = ''
  displayTitlePeerId.value = ''
  chatStore.setActive(peerId)
  pickRandomFakeTitle()
  if (!chatStore.messages[peerId] || chatStore.messages[peerId].length === 0) {
    hasMore.value = await chatStore.loadMessages(peerId)
    chatStore.markRead(peerId)
  }
  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

async function onScroll() {
  if (!scrollEl.value || !hasMore.value) return
  if (scrollEl.value.scrollTop < 120) {
    const peerId = chatStore.activePeerId
    const msgs   = chatStore.messages[peerId] || []
    const firstId = msgs.find(m => m.id)?.id
    const prevH  = scrollEl.value.scrollHeight
    hasMore.value = await chatStore.loadMessages(peerId, firstId)
    await nextTick()
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight - prevH
  }
}

// Auto-scroll when new messages arrive for the active peer
watch(() => currentMessages.value.length, async () => {
  const lastMsg = currentMessages.value[currentMessages.value.length - 1]
  if (!lastMsg) return
  // Only auto-scroll if near the bottom (within 200px)
  if (scrollEl.value) {
    const { scrollTop, scrollHeight, clientHeight } = scrollEl.value
    if (scrollHeight - scrollTop - clientHeight < 200) {
      await nextTick()
      scrollToBottom()
    }
  }
})

// ── Title blink ───────────────────────────────────────────────────────
let _blinkTimer = null
let _blinkFlip   = false

function _startBlink(count) {
  const showCount = auth.user?.notifyUnread !== 0
  if (auth.user?.notifyBlink === 0) {
    // 不闪烁，但仍静态更新标题
    document.title = showCount ? `(${count}) Nodex` : 'Nodex'
    return
  }
  if (_blinkTimer) return
  _blinkFlip = true
  _blinkTimer = setInterval(() => {
    _blinkFlip = !_blinkFlip
    const label = showCount ? `(${count}) 新消息 · Nodex` : '新消息 · Nodex'
    document.title = _blinkFlip ? label : 'Nodex'
  }, 1000)
}

function _stopBlink() {
  if (_blinkTimer) { clearInterval(_blinkTimer); _blinkTimer = null }
}

// Tab title blink
watch(() => chatStore.totalUnread, (n) => {
  const showCount = auth.user?.notifyUnread !== 0
  if (n > 0) {
    if (document.hidden) {
      _startBlink(n)
    } else {
      _stopBlink()
      document.title = showCount ? `(${n}) Nodex` : 'Nodex'
    }
  } else {
    _stopBlink()
    document.title = 'Nodex'
  }
}, { immediate: true })

// ── Send ──────────────────────────────────────────────────────────────
function send() {
  if (!draft.value.trim() || !chatStore.activePeerId) return
  chatStore.sendText(chatStore.activePeerId, draft.value.trim(), replyingTo.value)
  draft.value = ''
  replyingTo.value = null
  if (taRef.value) taRef.value.style.height = 'auto'
}

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

function autosize() {
  const ta = taRef.value; if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
}

// ── Files ─────────────────────────────────────────────────────────────
async function onFileSelect(e) {
  const file = e.target.files[0]
  if (!file || !chatStore.activePeerId) return
  if (fileInputRef.value) fileInputRef.value.value = ''
  const r = replyingTo.value
  replyingTo.value = null
  try {
    if (file.type.startsWith('image/')) await chatStore.sendImage(chatStore.activePeerId, file, r)
    else                                await chatStore.sendFile(chatStore.activePeerId, file, r)
    nextTick(scrollToBottom)
  } catch (err) {
    console.error('Upload failed', err)
  }
}

// ── Paste image ───────────────────────────────────────────────────────
async function onPaste(e) {
  if (!chatStore.activePeerId) return
  const items = Array.from(e.clipboardData?.items || [])
  const imageItem = items.find(item => item.type.startsWith('image/'))
  if (!imageItem) return
  e.preventDefault()
  const file = imageItem.getAsFile()
  if (!file) return
  const r = replyingTo.value
  replyingTo.value = null
  try {
    await chatStore.sendImage(chatStore.activePeerId, file, r)
    nextTick(scrollToBottom)
  } catch (err) {
    console.error('Paste image failed', err)
  }
}

// ── Recall ────────────────────────────────────────────────────────────
async function confirmRecall() {
  const id = recallConfirmId.value
  recallConfirmId.value = null
  if (id) await chatStore.recallMessage(id)
}

function retrySend(m) {
  if (!m.tempId || !m.toUserId) return
  wsStore.send({ type: 'send', clientMsgId: m.clientMsgId, to: m.toUserId, msgType: m.type, content: m.content })
}

// ── Sidebar display title (camouflage) ───────────────────────────────
// 从伪装列表随机抽一条作为顶栏标题
function pickRandomFakeTitle() {
  const allItems = FAKE_CONVS.flatMap(g => g.items)
  const item = allItems[Math.floor(Math.random() * allItems.length)]
  displayTitle.value = item.title
  displayTitlePeerId.value = item.id
}

// 点击左侧列表只改变顶栏显示名，不切换实际聊天对象
function selectDisplayTitle(peerId, peerName) {
  displayTitlePeerId.value = peerId
  displayTitle.value = peerName
}

// ── Hide conversation ─────────────────────────────────────────────────
async function hideConv(peerId) {
  await chatStore.hideConversation(peerId)
}

// ── New chat modal ────────────────────────────────────────────────────
function openNewChat() {
  showNewChat.value = true
  newChatId.value   = ''
  newChatError.value = ''
  nextTick(() => newChatInputRef.value?.focus())
}
function closeNewChat() {
  showNewChat.value  = false
  newChatId.value    = ''
  newChatError.value = ''
}

async function startNewChat() {
  const userId = newChatId.value.trim()
  if (!userId) return
  newChatError.value   = ''
  newChatLoading.value = true
  try {
    const userInfo = await api.findUser(userId)
    closeNewChat()
    // If already have a conversation, just switch to it
    const existing = chatStore.conversations.find(c => c.peer.userId === userId)
    if (existing) {
      selectConv(userId)
    } else {
      // Inject placeholder with real user name
      chatStore.conversations.unshift({
        peer: { userId, name: userInfo.name || userId },
        lastMessageAt: Date.now(), preview: '你好！', unread: 0
      })
      await selectConv(userId)
      // Auto-send greeting — this also creates the conversation record on the server,
      // so the dropdown entry persists after the next loadConversations
      chatStore.sendText(userId, '你好！')
    }
  } catch (e) {
    newChatError.value = e.status === 404 ? 'User not found.' : 'Error looking up user. Try again.'
  } finally {
    newChatLoading.value = false
  }
}

// ── Sleep mode ────────────────────────────────────────────────────────
function enterSleep() { sleepMode.value = true }
function exitSleep()  { sleepMode.value = false }

function onVisibilityChange() {
  if (document.hidden) {
    sleepTimer = setTimeout(() => { sleepMode.value = true }, 5 * 60 * 1000)
    if (chatStore.totalUnread > 0) _startBlink(chatStore.totalUnread)
  } else {
    clearTimeout(sleepTimer)
    sleepTimer = null
    _stopBlink()
    const n = chatStore.totalUnread
    const showCount = auth.user?.notifyUnread !== 0
    document.title = (n > 0 && showCount) ? `(${n}) Nodex` : 'Nodex'
    if (chatStore.activePeerId) chatStore.markRead(chatStore.activePeerId)
  }
}

// ── Settings ──────────────────────────────────────────────────────────
function openSettings() {
  settingsBlink.value      = auth.user?.notifyBlink  !== 0
  settingsUnread.value     = auth.user?.notifyUnread !== 0
  settingsShowFiller.value = auth.user?.showFiller   !== 0
  showSettings.value       = true
}

async function saveSettings() {
  settingsSaving.value = true
  try {
    await auth.updateSettings({
      notifyBlink:  settingsBlink.value      ? 1 : 0,
      notifyUnread: settingsUnread.value     ? 1 : 0,
      showFiller:   settingsShowFiller.value ? 1 : 0
    })
    showSettings.value = false
    // 立即更新标题
    const n = chatStore.totalUnread
    if (n > 0 && settingsUnread.value) document.title = `(${n}) Nodex`
    else document.title = 'Nodex'
  } catch (e) {
    console.error('Save settings failed', e)
  } finally {
    settingsSaving.value = false
  }
}

// ── Misc ──────────────────────────────────────────────────────────────
function copyId() { navigator.clipboard?.writeText(auth.user?.userId || '') }

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark')
  localStorage.setItem('nodex-theme', isDark ? 'dark' : 'light')
}

async function logout() {
  await auth.logout()
  wsStore.disconnect()
  router.push('/login')
}

// Close dropdowns / menus on outside click
function insertEmoji(emoji) {
  draft.value += emoji
  showEmojiPicker.value = false
  nextTick(() => taRef.value?.focus())
}

function onDocClick(e) {
  if (peerSelectRef.value && !peerSelectRef.value.contains(e.target)) {
    peerMenuOpen.value = false
  }
  if (emojiWrapRef.value && !emojiWrapRef.value.contains(e.target)) {
    showEmojiPicker.value = false
  }
  if (ctxMenu.value) closeCtxMenu()
}

function onKeyEsc(e) {
  if (e.key === 'Escape') {
    drawerOpen.value       = false
    peerMenuOpen.value     = false
    recallConfirmId.value  = null
    showEmojiPicker.value  = false
    viewerSrc.value        = null
    showSettings.value     = false
    replyingTo.value       = null
    ctxMenu.value          = null
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeyEsc)
  document.addEventListener('visibilitychange', onVisibilityChange)
  // 拉取 filler 文案列表
  api.fillers().then(data => { fillers.value = data }).catch(() => {})

  // Connect WebSocket if not already
  if (auth.isLoggedIn() && wsStore.state !== 'connected' && wsStore.state !== 'connecting') {
    wsStore.connect(auth.token)
  }
  // Load conversations
  await chatStore.loadConversations()
  // 默认打开第一个会话，selectConv 内部会随机抽取伪装标题
  if (!chatStore.activePeerId && chatStore.conversations.length > 0) {
    await selectConv(chatStore.conversations[0].peer.userId)
  } else {
    // 没有会话时也随机设置一个伪装标题
    pickRandomFakeTitle()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeyEsc)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimeout(sleepTimer)
  _stopBlink()
  document.title = 'Nodex'
})
</script>
