import SwiftUI

struct CityPageView: View {
    @State var vm: CityViewModel
    @State private var scrollOffset: CGFloat = 0
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
                    MetricStripView(stats: stats, avgAqi: vm.avgAqi)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 28)
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

                // 信源卡片（iPad 横屏两列）—— 逐卡错峰入场
                LazyVGrid(columns: providerColumns, spacing: 10) {
                    ForEach(Array(vm.annotated.enumerated()), id: \.element.id) { idx, item in
                        ProviderCardView(result: item)
                            .riseIn(0.16 + Double(idx) * 0.05)
                    }
                }
                .padding(.horizontal, 16)

                // AQI
                if !vm.air.isEmpty {
                    AQISectionView(air: vm.air)
                        .padding(.horizontal, 16)
                        .padding(.top, 20)
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
