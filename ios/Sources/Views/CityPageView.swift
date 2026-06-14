import SwiftUI

struct CityPageView: View {
    @State var vm: CityViewModel
    @State private var scrollOffset: CGFloat = 0
    @State private var cardsOpen = false
    @State private var aqiOpen = false
    @Environment(\.horizontalSizeClass) private var hSize

    private var isNight: Bool {
        var cal = Calendar.current
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let h = cal.component(.hour, from: Date())
        return h < 6 || h >= 19
    }

    // iPad（regular）横屏：内容限宽居中 + provider 卡两列
    private var isWide: Bool { hSize == .regular }
    private var maxContentWidth: CGFloat { isWide ? 760 : .infinity }
    private var statusInset: CGFloat { isWide ? 24 : 59 }
    private var providerColumns: [GridItem] {
        isWide
            ? [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
            : [GridItem(.flexible())]
    }

    // 滚动进度 0（顶部）→ 1（上滑超过阈值），驱动视差与吸顶
    private var scrollProgress: CGFloat { min(max(-scrollOffset / 180, 0), 1) }

    var body: some View {
        ZStack(alignment: .top) {
            // 天气动效背景 + 轻微视差放大
            Group {
                if let stats = vm.stats {
                    WeatherFXView(weatherText: stats.text, isNight: isNight,
                                  lat: vm.loc.lat, lon: vm.loc.lon)
                } else {
                    Color(hex: "#0b1426")
                }
            }
            .scaleEffect(1 + scrollProgress * 0.06)
            .ignoresSafeArea()

            // 天空渐变叠加
            LinearGradient(
                colors: [Color(hex: "#0b1426").opacity(0.55), .clear, Color(hex: "#0b1426").opacity(0.30)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            scrollContent

            stickyHeader
        }
        .task {
            if vm.initialLoad { await vm.refresh() }
        }
    }

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            // 滚动偏移探针
            GeometryReader { g in
                Color.clear.preference(key: ScrollOffsetKey.self,
                                       value: g.frame(in: .named("cityScroll")).minY)
            }
            .frame(height: 0)

            LazyVStack(spacing: 0) {
                // Hero — 上滑时淡出 + 缩小 + 视差
                if let stats = vm.stats {
                    HeroView(stats: stats, cityName: vm.loc.name, updatedAt: vm.updatedAt)
                        .padding(.horizontal, 20)
                        .opacity(1 - scrollProgress * 0.9)
                        .scaleEffect(1 - scrollProgress * 0.12, anchor: .top)
                        .offset(y: scrollOffset < 0 ? -scrollOffset * 0.25 : 0)
                        .riseIn(0)
                } else {
                    HeroSkeletonView()
                }

                // 预警
                if !vm.warnings.isEmpty {
                    WarningView(warnings: vm.warnings)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                        .riseIn(0.04)
                }

                // 关键指标条
                if let stats = vm.stats {
                    MetricStripView(stats: stats)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                        .riseIn(0.06)
                }

                // 番禺气象台短时预报卡
                if let f = vm.panyuForecast {
                    NoticeCardView(text: f.text, issuedAt: f.issuedAt)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .riseIn(0.10)
                }

                // 分钟级降水
                if let rain = vm.minutelyRain {
                    MinutelyRainView(rain: rain)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .riseIn(0.12)
                }

                // 信源：温度刻度条折叠 → 展开全部信源卡
                if let stats = vm.stats {
                    VStack(spacing: 0) {
                        SourceBarSummary(results: vm.results, stats: stats, isOpen: $cardsOpen)
                        if cardsOpen {
                            GlassEffectContainer {
                                LazyVGrid(columns: providerColumns, spacing: 10) {
                                    ForEach(vm.sortedAnnotated) { item in
                                        ProviderCardView(
                                            result: item,
                                            score: vm.scoreFor(item.base.providerId),
                                            onScoreChange: { delta in vm.updateScore(item.base.providerId, delta: delta) }
                                        )
                                    }
                                }
                            }
                            .padding(.top, 10)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .riseIn(0.16)
                } else {
                    // 不足 2 源：无可折叠摘要，直接平铺
                    GlassEffectContainer {
                        LazyVGrid(columns: providerColumns, spacing: 10) {
                            ForEach(Array(vm.sortedAnnotated.enumerated()), id: \.element.id) { idx, item in
                                ProviderCardView(
                                    result: item,
                                    score: vm.scoreFor(item.base.providerId),
                                    onScoreChange: { delta in vm.updateScore(item.base.providerId, delta: delta) }
                                )
                                .riseIn(0.16 + Double(idx) * 0.05)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }

                // AQI：色阶条折叠 → 展开各信源 AQI 卡
                if !vm.air.isEmpty, let avgAqi = vm.avgAqi {
                    VStack(spacing: 0) {
                        AqiBarSummary(avgAqi: avgAqi, isOpen: $aqiOpen)
                        if aqiOpen {
                            GlassEffectContainer {
                                AQISectionView(air: vm.air)
                            }
                            .padding(.top, 10)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .riseIn(0.20)
                }

                Spacer(minLength: 48)
            }
            .frame(maxWidth: maxContentWidth)
            .frame(maxWidth: .infinity)
        }
        .coordinateSpace(name: "cityScroll")
        .onPreferenceChange(ScrollOffsetKey.self) { scrollOffset = $0 }
        .refreshable {
            Haptics.soft()
            await vm.refresh()
        }
    }

    // 上滑吸顶条：城市名 · 温度（对齐 PWA loc-sticky，滚过 55% 后淡入）
    private var stickyHeader: some View {
        HStack(spacing: 8) {
            Text(vm.loc.name)
                .font(.system(size: 17, weight: .semibold))
                .kerning(-0.34)
                .foregroundStyle(.white)
            if let s = vm.stats {
                Text("· \(Int(s.avg.rounded()))°")
                    .font(.system(size: 17, weight: .regular).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.72))
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, statusInset)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(
            // 对齐 PWA 吸顶头：扁平深色渐变（非毛玻璃），底部渐隐
            LinearGradient(
                colors: [Color(hex: "#080c18").opacity(0.94),
                         Color(hex: "#080c18").opacity(0.88),
                         Color(hex: "#080c18").opacity(0)],
                startPoint: .top, endPoint: .bottom)
        )
        .opacity(Double(max(0, (scrollProgress - 0.55) / 0.35)))
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

// 滚动偏移 PreferenceKey
struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// 折叠摘要行：玻璃卡按钮，左侧自定义标签 + 右侧箭头；点击切换展开。
// 用 .plain 按钮样式去掉默认按压高亮（对齐 PWA 去掉折叠卡的点击选中效果）。
struct CollapsibleSummary<Label: View>: View {
    @Binding var isOpen: Bool
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button {
            Haptics.soft()
            withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { isOpen.toggle() }
        } label: {
            HStack(spacing: 10) {
                label()
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .glassCard()
        }
        .buttonStyle(.plain)
    }
}

// 信源温度刻度条（折叠摘要头）
struct SourceBarSummary: View {
    let results: [ProviderResult]
    let stats: WeatherStats
    @Binding var isOpen: Bool

    private var range: Double { stats.max - stats.min }
    private func pct(_ v: Double) -> Double {
        guard range > 0.05 else { return 0.5 }
        return max(0.03, min(0.97, (v - stats.min) / range))
    }

    var body: some View {
        Button {
            Haptics.soft()
            withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { isOpen.toggle() }
        } label: {
            HStack(spacing: 10) {
                GeometryReader { geo in
                    let w = geo.size.width
                    ZStack(alignment: .leading) {
                        // 轨道线
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.28), .white.opacity(0.28), .clear],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .frame(height: 1)
                        .padding(.horizontal, w * 0.02)
                        // 各信源彩色刻度
                        ForEach(results.filter { $0.current != nil }) { r in
                            Capsule()
                                .fill(Color(hex: r.color))
                                .frame(width: 2, height: 10)
                                .offset(x: pct(r.current!.temp) * w - 1)
                        }
                        // 加权均值发光圆点
                        Circle()
                            .fill(.white)
                            .frame(width: 9, height: 9)
                            .shadow(color: .white.opacity(0.75), radius: 5)
                            .offset(x: pct(stats.avg) * w - 4.5)
                    }
                }
                .frame(height: 22)

                Text("\(Int(stats.min.rounded()))° ～ \(Int(stats.max.rounded()))°")
                    .font(.system(size: 12, weight: .light))
                    .foregroundStyle(.white.opacity(0.5))
                    .fixedSize()

                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .glassCard()
        }
        .buttonStyle(.plain)
    }
}

// AQI 色阶条（折叠摘要头）
struct AqiBarSummary: View {
    let avgAqi: Int
    @Binding var isOpen: Bool

    private var dotPct: Double { max(0.02, min(0.98, Double(min(avgAqi, 300)) / 300.0)) }
    private var col: Color { aqiColor(avgAqi) }

    var body: some View {
        Button {
            Haptics.soft()
            withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) { isOpen.toggle() }
        } label: {
            HStack(spacing: 10) {
                GeometryReader { geo in
                    let w = geo.size.width
                    ZStack(alignment: .leading) {
                        // 渐变轨道
                        LinearGradient(
                            colors: [
                                Color(hex: "#34c759"), Color(hex: "#ffd60a"),
                                Color(hex: "#ff9f0a"), Color(hex: "#ff453a"),
                                Color(hex: "#af52de"), Color(hex: "#a1304e"),
                            ],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .opacity(0.46)
                        .frame(height: 4)
                        .clipShape(Capsule())
                        // 位置圆点
                        Circle()
                            .fill(col)
                            .frame(width: 11, height: 11)
                            .shadow(color: col.opacity(0.6), radius: 4)
                            .offset(x: dotPct * w - 5.5)
                    }
                }
                .frame(height: 22)

                HStack(spacing: 4) {
                    Text("\(avgAqi)").foregroundStyle(col).fontWeight(.medium)
                    Text("AQI ·").foregroundStyle(.white.opacity(0.5))
                    Text(aqiCategory(avgAqi)).foregroundStyle(col).fontWeight(.medium)
                }
                .font(.system(size: 12, weight: .light))
                .fixedSize()

                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .glassCard()
        }
        .buttonStyle(.plain)
    }
}

struct HeroSkeletonView: View {
    @State private var shimmer = false
    var body: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: CardRadius.sm).fill(shimmerGrad)
                .frame(width: 80, height: 20)
            RoundedRectangle(cornerRadius: CardRadius.regular).fill(shimmerGrad)
                .frame(width: 130, height: 80)
            RoundedRectangle(cornerRadius: CardRadius.sm).fill(shimmerGrad)
                .frame(width: 100, height: 22)
        }
        .padding(.vertical, 24)
        .onAppear { withAnimation(.linear(duration: 1.2).repeatForever()) { shimmer = true } }
    }
    private var shimmerGrad: LinearGradient {
        LinearGradient(colors: [.white.opacity(0.06), .white.opacity(0.14), .white.opacity(0.06)],
                       startPoint: shimmer ? .topLeading : .bottomTrailing,
                       endPoint: shimmer ? .bottomTrailing : .topLeading)
    }
}
