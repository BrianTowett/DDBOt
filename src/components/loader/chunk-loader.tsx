import { Loader } from '@deriv-com/ui';

export default function ChunkLoader({ message }: { message: string }) {
    // NOTE: Loader from @deriv-com/ui defaults to isFullScreen=true. We
    // explicitly pass `false` because this loader is already wrapped in
    // a `.app-root` flex container that fills the viewport — letting the
    // Loader add its own fullscreen overlay on top stacks two fullscreen
    // overlays and hides any sibling content (e.g. the dashboard once
    // a hard-deadline forces it to render).
    return (
        <div className='app-root'>
            <Loader isFullScreen={false} />
            <div className='load-message'>{message}</div>
        </div>
    );
}
