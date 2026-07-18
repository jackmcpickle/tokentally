import type { Child, FC } from 'hono/jsx';

export type InputVariant = 'text' | 'select';

const BASE =
    'ui-input w-full min-w-[130px] rounded-md border border-border bg-panel px-3.5 py-2.5 text-[15px] text-text outline-none';

type TextInputProps = {
    variant: 'text';
    id?: string;
    name?: string;
    class?: string;
    placeholder?: string;
    autocomplete?: string;
    required?: boolean;
    value?: string;
};

type SelectInputProps = {
    variant: 'select';
    id?: string;
    name?: string;
    class?: string;
    required?: boolean;
    children?: Child;
};

export type InputProps = TextInputProps | SelectInputProps;

function cx(...parts: Array<string | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export const Input: FC<InputProps> = (props) => {
    const className = cx(BASE, props.class);

    if (props.variant === 'select') {
        return (
            <select
                class={className}
                id={props.id}
                name={props.name}
                required={props.required}
            >
                {props.children}
            </select>
        );
    }

    return (
        <input
            class={className}
            id={props.id}
            name={props.name}
            type="text"
            placeholder={props.placeholder}
            autocomplete={props.autocomplete}
            required={props.required}
            value={props.value}
        />
    );
};
